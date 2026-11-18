import { Readable } from 'node:stream';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

export interface StorageDownloadResult {
  stream: NodeJS.ReadableStream;
  contentLength: number;
  contentRange?: string;
  mimeType: string;
  statusCode: number;
}

interface InMemoryFile {
  key: string;
  buffer: Buffer;
  mimeType: string;
  createdAt: Date;
}

interface InMemoryMultipart {
  key: string;
  mimeType: string;
  parts: Map<number, Buffer>;
}

class StorageService {
  private s3Client: S3Client | null = null;
  private isR2Configured = false;
  private bucketName: string;

  // In-memory fallback storage
  private memoryFiles = new Map<string, InMemoryFile>();
  private memoryMultiparts = new Map<string, InMemoryMultipart>();

  constructor() {
    this.bucketName = config.r2.bucketName || 'phoenix-drop-files';

    if (config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.endpoint) {
      try {
        this.s3Client = new S3Client({
          region: 'auto',
          endpoint: config.r2.endpoint,
          credentials: {
            accessKeyId: config.r2.accessKeyId,
            secretAccessKey: config.r2.secretAccessKey
          }
        });
        this.isR2Configured = true;
        console.log('[Storage] Initialized Cloudflare R2 S3 storage client.');
      } catch (err) {
        console.warn('[Storage] Failed to initialize R2 client, using in-memory store:', err);
      }
    } else {
      console.log('[Storage] R2 credentials not provided. Using in-memory fallback store.');
    }
  }

  generateKey(roomId: string, fileId: string, fileName: string): string {
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `rooms/${roomId}/${fileId}-${cleanName}`;
  }

  async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (this.isR2Configured && this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType
      });
      await this.s3Client.send(command);
      return key;
    }

    this.memoryFiles.set(key, {
      key,
      buffer,
      mimeType,
      createdAt: new Date()
    });
    return key;
  }

  async initiateMultipartUpload(key: string, mimeType: string): Promise<{ uploadId: string; key: string }> {
    if (this.isR2Configured && this.s3Client) {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimeType
      });
      const res = await this.s3Client.send(command);
      return { uploadId: res.UploadId || '', key };
    }

    const uploadId = `mp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.memoryMultiparts.set(uploadId, {
      key,
      mimeType,
      parts: new Map()
    });
    return { uploadId, key };
  }

  async uploadPart(key: string, uploadId: string, partNumber: number, buffer: Buffer): Promise<{ eTag: string }> {
    if (this.isR2Configured && this.s3Client) {
      const command = new UploadPartCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: buffer
      });
      const res = await this.s3Client.send(command);
      return { eTag: res.ETag || `"${partNumber}"` };
    }

    const mp = this.memoryMultiparts.get(uploadId);
    if (!mp) {
      throw new Error('Multipart upload not found or expired');
    }
    mp.parts.set(partNumber, buffer);
    return { eTag: `"${partNumber}"` };
  }

  async completeMultipartUpload(
    key: string, 
    uploadId: string, 
    parts: { partNumber: number; eTag: string }[]
  ): Promise<void> {
    if (this.isR2Configured && this.s3Client) {
      const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber).map(p => ({
        PartNumber: p.partNumber,
        ETag: p.eTag
      }));
      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: sortedParts }
      });
      await this.s3Client.send(command);
      return;
    }

    const mp = this.memoryMultiparts.get(uploadId);
    if (!mp) {
      throw new Error('Multipart upload not found');
    }

    const sortedPartNumbers = Array.from(mp.parts.keys()).sort((a, b) => a - b);
    const combinedBuffers: Buffer[] = [];
    for (const num of sortedPartNumbers) {
      const partBuf = mp.parts.get(num);
      if (partBuf) combinedBuffers.push(partBuf);
    }

    const finalBuffer = Buffer.concat(combinedBuffers);
    this.memoryFiles.set(key, {
      key,
      buffer: finalBuffer,
      mimeType: mp.mimeType,
      createdAt: new Date()
    });
    this.memoryMultiparts.delete(uploadId);
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    if (this.isR2Configured && this.s3Client) {
      try {
        const command = new AbortMultipartUploadCommand({
          Bucket: this.bucketName,
          Key: key,
          UploadId: uploadId
        });
        await this.s3Client.send(command);
      } catch (e) {
        // Ignored
      }
      return;
    }

    this.memoryMultiparts.delete(uploadId);
  }

  async getDownloadStream(key: string, rangeHeader?: string): Promise<StorageDownloadResult | null> {
    if (this.isR2Configured && this.s3Client) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Range: rangeHeader
        });
        const res = await this.s3Client.send(command);
        const stream = res.Body as NodeJS.ReadableStream;
        const contentLength = res.ContentLength || 0;
        const contentRange = res.ContentRange;
        const mimeType = res.ContentType || 'application/octet-stream';
        const statusCode = rangeHeader && contentRange ? 206 : 200;

        return {
          stream,
          contentLength,
          contentRange,
          mimeType,
          statusCode
        };
      } catch (err: any) {
        if (err?.name === 'NoSuchKey') return null;
        throw err;
      }
    }

    const file = this.memoryFiles.get(key);
    if (!file) return null;

    const totalLength = file.buffer.length;

    if (rangeHeader) {
      const matches = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (matches) {
        let start = matches[1] ? parseInt(matches[1], 10) : 0;
        let end = matches[2] ? parseInt(matches[2], 10) : totalLength - 1;

        if (isNaN(start)) {
          start = totalLength - parseInt(matches[2], 10);
          end = totalLength - 1;
        }

        start = Math.max(0, start);
        end = Math.min(totalLength - 1, end);

        if (start <= end && start < totalLength) {
          const sliced = file.buffer.subarray(start, end + 1);
          return {
            stream: Readable.from(sliced),
            contentLength: sliced.length,
            contentRange: `bytes ${start}-${end}/${totalLength}`,
            mimeType: file.mimeType,
            statusCode: 206
          };
        }
      }
    }

    return {
      stream: Readable.from(file.buffer),
      contentLength: totalLength,
      mimeType: file.mimeType,
      statusCode: 200
    };
  }

  async getSignedDownloadUrl(key: string, fileName: string, expiresInSeconds = 900): Promise<string | null> {
    if (this.isR2Configured && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
    }

    return null;
  }

  async deleteFile(key: string): Promise<void> {
    if (this.isR2Configured && this.s3Client) {
      try {
        const command = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key
        });
        await this.s3Client.send(command);
      } catch (e) {
        // Ignored
      }
      return;
    }

    this.memoryFiles.delete(key);
  }

  async deleteRoomFiles(roomId: string): Promise<void> {
    const prefix = `rooms/${roomId}/`;
    for (const key of Array.from(this.memoryFiles.keys())) {
      if (key.startsWith(prefix)) {
        this.memoryFiles.delete(key);
      }
    }
  }
}

export const storageService = new StorageService();
