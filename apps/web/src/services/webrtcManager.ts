import { 
  ConnectionState, 
  DEFAULT_STUN_SERVERS, 
  FileMetadata, 
  MAX_CONCURRENT_OUTGOING_TRANSFERS 
} from '@phoenix-drop/shared';
import { socketService } from './socket.js';
import { transferEngine, computeSha256 } from './transferEngine.js';

export interface PeerConnectionContext {
  peerId: string;
  connection: RTCPeerConnection;
  controlChannel?: RTCDataChannel;
  dataChannel?: RTCDataChannel;
  connectionState: ConnectionState;
}

export type PeerStateChangeListener = (peerId: string, state: ConnectionState) => void;

export class WebRTCManager {
  private peers = new Map<string, PeerConnectionContext>();
  private iceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS;
  private myPeerId = '';
  private stateListeners: PeerStateChangeListener[] = [];

  initialize(myPeerId: string, iceServers?: RTCIceServer[]): void {
    this.myPeerId = myPeerId;
    if (iceServers && iceServers.length > 0) {
      this.iceServers = iceServers;
    }
    this.setupSocketListeners();
  }

  onPeerStateChange(listener: PeerStateChangeListener): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }

  private notifyState(peerId: string, state: ConnectionState): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connectionState = state;
    }
    for (const listener of this.stateListeners) {
      listener(peerId, state);
    }
  }

  getPeer(peerId: string): PeerConnectionContext | undefined {
    return this.peers.get(peerId);
  }

  getAllPeers(): PeerConnectionContext[] {
    return Array.from(this.peers.values());
  }

  private setupSocketListeners(): void {
    const socket = socketService.getSocket();
    if (!socket) return;

    // A new peer joined the room: if I am an existing peer, initiate connection
    socket.off('signal:peer_joined');
    socket.on('signal:peer_joined', (data: { peer: { id: string } }) => {
      if (data.peer.id !== this.myPeerId) {
        this.initiateConnection(data.peer.id);
      }
    });

    // Received WebRTC Offer
    socket.off('signal:offer');
    socket.on('signal:offer', async (data: { senderPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.targetPeerId === this.myPeerId) {
        await this.handleOffer(data.senderPeerId, data.sdp);
      }
    });

    // Received WebRTC Answer
    socket.off('signal:answer');
    socket.on('signal:answer', async (data: { senderPeerId: string; targetPeerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (data.targetPeerId === this.myPeerId) {
        await this.handleAnswer(data.senderPeerId, data.sdp);
      }
    });

    // Received ICE Candidate
    socket.off('signal:ice_candidate');
    socket.on('signal:ice_candidate', async (data: { senderPeerId: string; targetPeerId: string; candidate: RTCIceCandidateInit }) => {
      if (data.targetPeerId === this.myPeerId) {
        await this.handleIceCandidate(data.senderPeerId, data.candidate);
      }
    });

    // Remote peer left
    socket.off('signal:peer_left');
    socket.on('signal:peer_left', (data: { peerId: string }) => {
      this.closePeer(data.peerId);
    });
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 2
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendSignalIceCandidate(peerId, event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      let mapped: ConnectionState = 'connecting';
      switch (pc.connectionState) {
        case 'connected':
          mapped = 'connected';
          break;
        case 'disconnected':
          mapped = 'disconnected';
          break;
        case 'failed':
          mapped = 'failed';
          break;
        case 'closed':
          mapped = 'disconnected';
          break;
        default:
          mapped = 'connecting';
      }
      this.notifyState(peerId, mapped);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pc;
  }

  /**
   * Initiator: Creates offer and sets up DataChannels
   */
  async initiateConnection(peerId: string): Promise<void> {
    if (this.peers.has(peerId)) {
      this.closePeer(peerId);
    }

    const pc = this.createPeerConnection(peerId);

    // Create Data Channels
    const controlChannel = pc.createDataChannel('phoenix-control', { ordered: true });
    const dataChannel = pc.createDataChannel('phoenix-data', { ordered: true });

    const ctx: PeerConnectionContext = {
      peerId,
      connection: pc,
      controlChannel,
      dataChannel,
      connectionState: 'connecting'
    };
    this.peers.set(peerId, ctx);
    this.notifyState(peerId, 'connecting');

    this.bindChannels(peerId, controlChannel, dataChannel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.sendSignalOffer(peerId, offer);
    } catch (err) {
      console.error('[WebRTC] Error creating offer for peer:', peerId, err);
      this.notifyState(peerId, 'failed');
    }
  }

  /**
   * Receiver: Handles offer and creates answer
   */
  async handleOffer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.peers.has(peerId)) {
      this.closePeer(peerId);
    }

    const pc = this.createPeerConnection(peerId);
    const ctx: PeerConnectionContext = {
      peerId,
      connection: pc,
      connectionState: 'connecting'
    };
    this.peers.set(peerId, ctx);
    this.notifyState(peerId, 'connecting');

    pc.ondatachannel = (event) => {
      const ch = event.channel;
      if (ch.label === 'phoenix-control') {
        ctx.controlChannel = ch;
      } else if (ch.label === 'phoenix-data') {
        ctx.dataChannel = ch;
      }
      if (ctx.controlChannel && ctx.dataChannel) {
        this.bindChannels(peerId, ctx.controlChannel, ctx.dataChannel);
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketService.sendSignalAnswer(peerId, answer);
    } catch (err) {
      console.error('[WebRTC] Error handling offer from peer:', peerId, err);
      this.notifyState(peerId, 'failed');
    }
  }

  async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error('[WebRTC] Error setting remote answer:', err);
    }
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate:', err);
    }
  }

  private bindChannels(peerId: string, controlChannel: RTCDataChannel, dataChannel: RTCDataChannel): void {
    dataChannel.binaryType = 'arraybuffer';

    controlChannel.onopen = () => {
      this.notifyState(peerId, 'connected');
    };

    controlChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        transferEngine.handleControlMessage(peerId, msg, dataChannel, controlChannel);
      } catch (err) {
        console.error('[WebRTC] Error parsing control message:', err);
      }
    };

    dataChannel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        transferEngine.handleBinaryChunk(event.data);
      }
    };

    controlChannel.onerror = (e) => console.warn('[WebRTC] Control channel error:', e);
    dataChannel.onerror = (e) => console.warn('[WebRTC] Data channel error:', e);
  }

  /**
   * Broadcasts a file to all connected room peers with controlled fan-out
   */
  async broadcastFile(file: File): Promise<void> {
    const connectedPeers = Array.from(this.peers.values()).filter(
      p => p.connectionState === 'connected' && p.controlChannel?.readyState === 'open' && p.dataChannel?.readyState === 'open'
    );

    if (connectedPeers.length === 0) {
      throw new Error('No connected peers in the room to receive file.');
    }

    // Precalculate SHA-256 once for the entire fan-out
    const sha256 = await computeSha256(file);
    const chunkSize = 64 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const fileId = crypto.randomUUID();

    const metadata: FileMetadata = {
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize,
      sha256,
      senderId: this.myPeerId,
      senderName: 'Me',
      createdAt: new Date().toISOString()
    };

    // Announce to room via socket
    await socketService.announceTransfer(metadata);

    // Controlled fan-out: transfer to recipients in batches of MAX_CONCURRENT_OUTGOING_TRANSFERS
    const queue = [...connectedPeers];
    const runWorker = async () => {
      while (queue.length > 0) {
        const target = queue.shift();
        if (target && target.dataChannel && target.controlChannel) {
          try {
            await transferEngine.sendFile(file, target.peerId, target.dataChannel, target.controlChannel, metadata);
          } catch (err) {
            console.error(`[WebRTC] Failed to send file to peer ${target.peerId}:`, err);
          }
        }
      }
    };

    const workers = [];
    const concurrency = Math.min(MAX_CONCURRENT_OUTGOING_TRANSFERS, connectedPeers.length);
    for (let i = 0; i < concurrency; i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);
  }

  closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.controlChannel?.close();
      peer.dataChannel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
      this.notifyState(peerId, 'disconnected');
    }
  }

  closeAll(): void {
    for (const peerId of this.peers.keys()) {
      this.closePeer(peerId);
    }
  }
}

export const webrtcManager = new WebRTCManager();
