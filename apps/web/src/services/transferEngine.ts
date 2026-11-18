import { 
  FileMetadata, 
  TransferProgress, 
  TransferState,
  DEFAULT_CHUNK_SIZE,
  HIGH_WATER_MARK,
  packChunk,
  unpackChunk,
  ControlMessage
} from '@phoenix-drop/shared';

export interface FileTransferSession {
  fileId: string;
  metadata: FileMetadata;
  isSender: boolean;
  peerId: string;
  dataChannel: RTCDataChannel;
  controlChannel: RTCDataChannel;
  state: TransferState;
  chunksCompleted: number;
  totalChunks: number;
  bytesTransferred: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number;
  blob?: Blob;
  downloadUrl?: string;
  error?: string;
}

export type TransferUpdateListener = (session: FileTransferSession) => void;

/**
 * Calculates SHA-256 checksum of an ArrayBuffer or Blob using Web Crypto API
 */
export async function computeSha256(data: ArrayBuffer | Blob): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class TransferEngine {
  private sessions = new Map<string, FileTransferSession>();
  private receivedChunks = new Map<string, ArrayBuffer[]>();
  private pauseFlags = new Map<string, boolean>();
  private cancelFlags = new Map<string, boolean>();
  private listeners: TransferUpdateListener[] = [];

  subscribe(listener: TransferUpdateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(session: FileTransferSession): void {
    for (const listener of this.listeners) {
      listener(session);
    }
  }

  getSession(fileId: string): FileTransferSession | undefined {
    return this.sessions.get(fileId);
  }

  getAllSessions(): FileTransferSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * SENDER: Sends a file to a remote peer over RTCDataChannel with backpressure
   */
  async sendFile(
    file: File, 
    peerId: string, 
    dataChannel: RTCDataChannel, 
    controlChannel: RTCDataChannel,
    precomputedMetadata?: FileMetadata
  ): Promise<void> {
    const chunkSize = DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);

    let metadata: FileMetadata;
    if (precomputedMetadata) {
      metadata = precomputedMetadata;
    } else {
      const sha256 = await computeSha256(file);
      metadata = {
        fileId: crypto.randomUUID(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        totalChunks,
        chunkSize,
        sha256,
        senderId: 'me',
        senderName: 'Me',
        createdAt: new Date().toISOString()
      };
    }

    const session: FileTransferSession = {
      fileId: metadata.fileId,
      metadata,
      isSender: true,
      peerId,
      dataChannel,
      controlChannel,
      state: 'preparing',
      chunksCompleted: 0,
      totalChunks,
      bytesTransferred: 0,
      totalBytes: file.size,
      speedBps: 0,
      etaSeconds: 0
    };

    this.sessions.set(metadata.fileId, session);
    this.pauseFlags.set(metadata.fileId, false);
    this.cancelFlags.set(metadata.fileId, false);
    this.notify(session);

    // 1. Send FILE_OFFER over control channel
    const offer: ControlMessage = {
      type: 'FILE_OFFER',
      file: metadata
    };
    if (controlChannel.readyState === 'open') {
      controlChannel.send(JSON.stringify(offer));
    } else {
      session.state = 'failed';
      session.error = 'Control channel not open';
      this.notify(session);
      return;
    }

    session.state = 'transferring';
    this.notify(session);

    // 2. Start chunk transmission with backpressure
    const startTime = Date.now();
    let lastTime = startTime;
    let lastBytes = 0;

    dataChannel.binaryType = 'arraybuffer';

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      // Check cancellation
      if (this.cancelFlags.get(metadata.fileId)) {
        session.state = 'cancelled';
        this.notify(session);
        controlChannel.send(JSON.stringify({ type: 'TRANSFER_CANCEL', fileId: metadata.fileId }));
        return;
      }

      // Check pause
      while (this.pauseFlags.get(metadata.fileId)) {
        session.state = 'paused';
        this.notify(session);
        await new Promise(r => setTimeout(r, 200));
        if (this.cancelFlags.get(metadata.fileId)) break;
      }

      session.state = 'transferring';

      // Read chunk from File
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const slice = file.slice(start, end);
      const chunkBuffer = await slice.arrayBuffer();

      // Pack chunk with PDCK wire header
      const packet = packChunk(metadata.fileId, chunkIndex, chunkBuffer);

      // Backpressure handling: if bufferedAmount is too high, wait for onbufferedamountlow
      if (dataChannel.bufferedAmount > HIGH_WATER_MARK) {
        await new Promise<void>((resolve) => {
          const onLow = () => {
            dataChannel.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          dataChannel.addEventListener('bufferedamountlow', onLow);
        });
      }

      // Transmit packed binary frame
      try {
        dataChannel.send(packet);
      } catch (err) {
        console.error('[Transfer] Send error:', err);
        session.state = 'failed';
        session.error = 'Failed to transmit chunk over WebRTC';
        this.notify(session);
        return;
      }

      session.chunksCompleted = chunkIndex + 1;
      session.bytesTransferred = Math.min(session.bytesTransferred + chunkBuffer.byteLength, file.size);

      // Speed & ETA calculations (windowed)
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.5 || session.chunksCompleted === totalChunks) {
        const bytesDelta = session.bytesTransferred - lastBytes;
        session.speedBps = Math.round(bytesDelta / elapsed);
        const remainingBytes = file.size - session.bytesTransferred;
        session.etaSeconds = session.speedBps > 0 ? Math.ceil(remainingBytes / session.speedBps) : 0;
        lastTime = now;
        lastBytes = session.bytesTransferred;
        this.notify(session);
      }
    }

    session.state = 'completed';
    session.speedBps = 0;
    session.etaSeconds = 0;
    this.notify(session);

    // Notify complete over control channel
    controlChannel.send(JSON.stringify({
      type: 'TRANSFER_COMPLETE',
      fileId: metadata.fileId,
      verified: true
    }));
  }

  /**
   * RECEIVER: Handles incoming control messages from remote peer
   */
  handleControlMessage(
    peerId: string, 
    msg: ControlMessage, 
    dataChannel: RTCDataChannel, 
    controlChannel: RTCDataChannel
  ): void {
    switch (msg.type) {
      case 'FILE_OFFER': {
        const metadata = msg.file;
        const session: FileTransferSession = {
          fileId: metadata.fileId,
          metadata,
          isSender: false,
          peerId,
          dataChannel,
          controlChannel,
          state: 'transferring',
          chunksCompleted: 0,
          totalChunks: metadata.totalChunks,
          bytesTransferred: 0,
          totalBytes: metadata.fileSize,
          speedBps: 0,
          etaSeconds: 0
        };

        this.sessions.set(metadata.fileId, session);
        this.receivedChunks.set(metadata.fileId, new Array(metadata.totalChunks));
        this.notify(session);

        // Acknowledge acceptance
        controlChannel.send(JSON.stringify({
          type: 'FILE_ACCEPT',
          fileId: metadata.fileId,
          startChunkIndex: 0
        }));
        break;
      }

      case 'TRANSFER_PAUSE': {
        const s = this.sessions.get(msg.fileId);
        if (s) {
          s.state = 'paused';
          this.notify(s);
        }
        break;
      }

      case 'TRANSFER_CANCEL': {
        const s = this.sessions.get(msg.fileId);
        if (s) {
          s.state = 'cancelled';
          this.notify(s);
        }
        break;
      }
    }
  }

  /**
   * RECEIVER: Handles binary chunk received on RTCDataChannel
   */
  async handleBinaryChunk(buffer: ArrayBuffer): Promise<void> {
    const unpacked = unpackChunk(buffer);
    if (!unpacked.valid) {
      console.warn('[Transfer] Invalid or malformed binary packet received');
      return;
    }

    const { fileId, chunkIndex, payload } = unpacked;
    const session = this.sessions.get(fileId);
    if (!session || session.isSender) return;

    const chunkArray = this.receivedChunks.get(fileId);
    if (!chunkArray) return;

    // Prevent duplicate chunk insertion
    if (!chunkArray[chunkIndex]) {
      chunkArray[chunkIndex] = payload;
      session.chunksCompleted++;
      session.bytesTransferred += payload.byteLength;
    }

    // Progress update
    this.notify(session);

    // If all chunks received, verify integrity!
    if (session.chunksCompleted >= session.totalChunks) {
      session.state = 'verifying';
      this.notify(session);

      try {
        const finalBlob = new Blob(chunkArray, { type: session.metadata.fileType });
        const receivedSha = await computeSha256(finalBlob);

        if (receivedSha.toLowerCase() === session.metadata.sha256.toLowerCase()) {
          session.state = 'completed';
          session.blob = finalBlob;
          session.downloadUrl = URL.createObjectURL(finalBlob);
          this.notify(session);

          // Clean up chunks array from memory to free RAM immediately
          this.receivedChunks.delete(fileId);
        } else {
          session.state = 'failed';
          session.error = 'SHA-256 integrity verification failed: received data does not match sender checksum.';
          this.notify(session);
        }
      } catch (err) {
        session.state = 'failed';
        session.error = `Failed to assemble file: ${String(err)}`;
        this.notify(session);
      }
    }
  }

  pauseTransfer(fileId: string): void {
    this.pauseFlags.set(fileId, true);
    const s = this.sessions.get(fileId);
    if (s) {
      s.state = 'paused';
      s.controlChannel.send(JSON.stringify({ type: 'TRANSFER_PAUSE', fileId }));
      this.notify(s);
    }
  }

  resumeTransfer(fileId: string): void {
    this.pauseFlags.set(fileId, false);
    const s = this.sessions.get(fileId);
    if (s) {
      s.state = 'transferring';
      s.controlChannel.send(JSON.stringify({ type: 'TRANSFER_RESUME', fileId, fromChunkIndex: s.chunksCompleted }));
      this.notify(s);
    }
  }

  cancelTransfer(fileId: string): void {
    this.cancelFlags.set(fileId, true);
    const s = this.sessions.get(fileId);
    if (s) {
      s.state = 'cancelled';
      s.controlChannel.send(JSON.stringify({ type: 'TRANSFER_CANCEL', fileId }));
      this.notify(s);
    }
  }
}

export const transferEngine = new TransferEngine();
