import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Upload, 
  File as FileIcon, 
  Download, 
  Eye, 
  Pause, 
  Play, 
  XCircle, 
  ShieldCheck, 
  Send, 
  Users, 
  MessageSquare, 
  FolderDown, 
  Smartphone, 
  Laptop, 
  Tablet, 
  AlertTriangle, 
  Loader2, 
  Lock, 
  Share2, 
  Copy, 
  Check, 
  Clock,
  LogOut,
  Power,
  UserCheck 
} from 'lucide-react';
import { 
  RoomMetadata, 
  ParticipantInfo, 
  ChatMessage, 
  formatBytes, 
  formatSpeed, 
  formatEta, 
  MOBILE_WARN_FILE_SIZE, 
  getFileExtension 
} from '@phoenix-drop/shared';
import { Navbar } from './Navbar.js';
import { FilePreviewModal } from './FilePreviewModal.js';
import { HostSettingsModal } from './HostSettingsModal.js';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';
import { webrtcManager } from '../services/webrtcManager.js';
import { transferEngine, FileTransferSession } from '../services/transferEngine.js';

export const RoomView: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // Room state
  const [room, setRoom] = useState<RoomMetadata | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [selfId, setSelfId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'chat' | 'peers'>('files');
  const [unreadChat, setUnreadChat] = useState(0);

  // Dialog states
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showHostLeaveDialog, setShowHostLeaveDialog] = useState(false);
  const [showCloseRoomConfirm, setShowCloseRoomConfirm] = useState(false);
  const [selectedNewHostId, setSelectedNewHostId] = useState<string>('');

  // Transfer state
  const [sessions, setSessions] = useState<FileTransferSession[]>([]);
  const [previewSession, setPreviewSession] = useState<FileTransferSession | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileWarning, setMobileWarning] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Initialize room & WebRTC
  useEffect(() => {
    if (!roomId) return;

    const storedHostToken = sessionStorage.getItem(`phoenix_host_${roomId}`);
    const displayName = sessionStorage.getItem(`phoenix_name_${roomId}`) || 'Guest';

    if (storedHostToken) {
      setHostToken(storedHostToken);
      setIsHost(true);
    }

    const deviceType = window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop';

    // Connect to room via Socket.IO
    socketService.joinRoom({
      roomId,
      displayName,
      deviceType
    }).then((res) => {
      if (res.error) {
        alert(`Failed to enter room: ${res.error}`);
        navigate('/');
        return;
      }

      if (res.room && res.self) {
        setRoom(res.room);
        setParticipants(res.room.participants || []);
        setIsHost(res.self.isHost);
        setSelfId(res.self.id);

        // Initialize WebRTC Manager
        webrtcManager.initialize(res.self.id, res.iceServers);
      }
      setConnecting(false);
    }).catch((err) => {
      console.error('[Room] Connection failed:', err);
      alert('Could not establish connection to room.');
      navigate('/');
    });

    // Listen to transfer engine updates
    const unsubscribeTransfer = transferEngine.subscribe((updatedSession) => {
      setSessions(transferEngine.getAllSessions());
    });

    // Listen to peer connection state changes
    const unsubscribeWebRTC = webrtcManager.onPeerStateChange((peerId, state) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === peerId ? { ...p, connectionState: state } : p))
      );
    });

    // Socket listeners for room updates & chat
    const socket = socketService.getSocket();
    if (socket) {
      socket.on('signal:peer_joined', (data: { peer: ParticipantInfo }) => {
        setParticipants((prev) => {
          if (prev.some((p) => p.id === data.peer.id)) return prev;
          return [...prev, data.peer];
        });
      });

      socket.on('signal:peer_left', (data: { peerId: string }) => {
        setParticipants((prev) => prev.filter((p) => p.id !== data.peerId));
      });

      socket.on('chat:message', (msg: ChatMessage) => {
        setMessages((prev) => [...prev, msg]);
        if (activeTab !== 'chat') {
          setUnreadChat((c) => c + 1);
        }
      });

      socket.on('room:updated', (data: { settings: any; name?: string }) => {
        setRoom((prev) => (prev ? { ...prev, name: data.name || prev.name, settings: data.settings } : prev));
      });

      socket.on('room:host_transferred', (data: { newHostId: string }) => {
        setParticipants((prev) =>
          prev.map((p) => ({ ...p, isHost: p.id === data.newHostId }))
        );
        if (selfId && data.newHostId === selfId) {
          setIsHost(true);
        }
      });

      socket.on('room:closed', (data: { message?: string }) => {
        alert(data.message || 'The room has been permanently closed by the host.');
        sessionStorage.removeItem(`phoenix_host_${roomId}`);
        sessionStorage.removeItem(`phoenix_token_${roomId}`);
        sessionStorage.removeItem(`phoenix_name_${roomId}`);
        navigate('/');
      });

      socket.on('room:kicked', (data: { reason: string }) => {
        alert(data.reason || 'You have been disconnected by the host.');
        navigate('/');
      });
    }

    return () => {
      unsubscribeTransfer();
      unsubscribeWebRTC();
      webrtcManager.closeAll();
      socketService.disconnect();
    };
  }, [roomId, navigate]);

  // Leave & Close Room Handlers
  const handleLeaveClick = () => {
    const otherParticipants = participants.filter((p) => p.id !== selfId);
    if (isHost && otherParticipants.length > 0) {
      setSelectedNewHostId(otherParticipants[0].id);
      setShowHostLeaveDialog(true);
    } else {
      setShowLeaveConfirm(true);
    }
  };

  const handleConfirmLeave = async () => {
    try {
      await socketService.leaveRoom();
      if (roomId) {
        sessionStorage.removeItem(`phoenix_host_${roomId}`);
        sessionStorage.removeItem(`phoenix_token_${roomId}`);
        sessionStorage.removeItem(`phoenix_name_${roomId}`);
      }
      navigate('/');
    } catch (e) {
      navigate('/');
    }
  };

  const handleHostLeaveWithTransfer = async () => {
    if (!selectedNewHostId || !roomId || !hostToken) return;
    try {
      await api.executeHostAction(roomId, hostToken, 'transfer_host', selectedNewHostId);
      await socketService.leaveRoom();
      sessionStorage.removeItem(`phoenix_host_${roomId}`);
      sessionStorage.removeItem(`phoenix_token_${roomId}`);
      sessionStorage.removeItem(`phoenix_name_${roomId}`);
      navigate('/');
    } catch (err: any) {
      alert(err.message || 'Failed to transfer ownership before leaving.');
    }
  };

  const handleConfirmCloseRoom = async () => {
    if (!roomId || !hostToken) return;
    try {
      await api.executeHostAction(roomId, hostToken, 'close_room');
      await socketService.closeRoom(hostToken);
      sessionStorage.removeItem(`phoenix_host_${roomId}`);
      sessionStorage.removeItem(`phoenix_token_${roomId}`);
      sessionStorage.removeItem(`phoenix_name_${roomId}`);
      navigate('/');
    } catch (err: any) {
      alert(err.message || 'Failed to close room.');
    }
  };

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  // Handle file sending
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setMobileWarning(null);

    const isMobile = window.innerWidth < 768;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check room settings
      if (room && !room.settings.uploadsEnabled) {
        setUploadError('File uploads are currently disabled in this room.');
        return;
      }

      if (room && file.size > room.settings.maxFileSize) {
        setUploadError(`File "${file.name}" exceeds maximum allowed size of ${formatBytes(room.settings.maxFileSize)}.`);
        return;
      }

      if (room && room.settings.allowedExtensions.length > 0) {
        const ext = getFileExtension(file.name);
        if (!room.settings.allowedExtensions.includes(ext)) {
          setUploadError(`File extension .${ext} is not permitted in this room.`);
          return;
        }
      }

      // Mobile warning for large transfers
      if (isMobile && file.size > MOBILE_WARN_FILE_SIZE) {
        setMobileWarning(
          `Notice: "${file.name}" is ${formatBytes(file.size)}. On mobile browsers, keep your screen unlocked and browser active to prevent transfer suspension.`
        );
      }

      try {
        await webrtcManager.broadcastFile(file);
      } catch (err: any) {
        setUploadError(err.message || 'Failed to initiate peer file transfer.');
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const content = chatInput.trim();
    setChatInput('');

    const res = await socketService.sendChatMessage(content);
    if (res.error) {
      alert(res.error);
    }
  };

  const renderDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="w-3.5 h-3.5 text-zinc-400" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-zinc-400" />;
      default:
        return <Laptop className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  if (connecting) {
    return (
      <div className="min-h-screen bg-[#0c0d10] flex flex-col items-center justify-center text-zinc-300">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-4" />
        <p className="text-sm font-medium">Entering Room & Negotiating P2P Channels...</p>
      </div>
    );
  }

  const activeTransfers = sessions.filter((s) => s.state !== 'completed');
  const completedTransfers = sessions.filter((s) => s.state === 'completed');

  return (
    <div className="min-h-screen bg-[#0c0d10] text-zinc-100 flex flex-col selection:bg-orange-500/30">
      <Navbar
        roomCode={room?.code}
        isHost={isHost}
        isLocked={room?.settings.isLocked}
        participantCount={participants.length}
        maxParticipants={room?.settings.maxParticipants}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLeaveRoom={handleLeaveClick}
        onCloseRoom={() => setShowCloseRoomConfirm(true)}
      />

      {/* Main Grid View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Participant Presence (Hidden on mobile when on other tabs) */}
        <div className={`lg:col-span-3 space-y-4 ${activeTab === 'peers' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-[#12141a] border border-zinc-800 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Peers Connected</h3>
              </div>
              <span className="text-xs font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800">
                {participants.length}/{room?.settings.maxParticipants}
              </span>
            </div>

            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {participants.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-500">
                  Waiting for peers to join... Share your room link!
                </div>
              ) : (
                participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-850 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          p.connectionState === 'connected'
                            ? 'bg-emerald-500'
                            : p.connectionState === 'failed'
                            ? 'bg-red-500'
                            : 'bg-amber-500 animate-pulse'
                        }`}
                      />
                      <span className="font-semibold text-zinc-200 truncate">{p.displayName}</span>
                      {p.isHost && (
                        <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.2 rounded shrink-0">
                          Host
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderDeviceIcon(p.deviceType)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center Column: File Dropzone & Transfer Queue (Visible on 'files' tab) */}
        <div className={`lg:col-span-6 space-y-6 ${activeTab === 'files' ? 'block' : 'hidden lg:block'}`}>
          {/* Room Header Card with Leave & Close Options */}
          <div className="bg-[#12141a] border border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">{room?.name}</h2>
                {isHost && (
                  <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full font-semibold">
                    Host
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Room Code: <span className="text-orange-400 font-bold">{room?.code}</span> • {participants.length} peer{participants.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isHost && (
                <button
                  onClick={() => setShowCloseRoomConfirm(true)}
                  className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Close room permanently for all peers"
                >
                  <Power className="w-3.5 h-3.5 text-red-400" />
                  <span>Close Room</span>
                </button>
              )}
              <button
                onClick={handleLeaveClick}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-red-900/60 text-zinc-300 hover:text-red-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Leave this room"
              >
                <LogOut className="w-3.5 h-3.5 text-zinc-400 hover:text-red-400" />
                <span>Leave Room</span>
              </button>
            </div>
          </div>
          {/* Mobile suspension alert if any */}
          {mobileWarning && (
            <div className="p-3.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>{mobileWarning}</span>
            </div>
          )}

          {/* Upload error banner if any */}
          {uploadError && (
            <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
              <XCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition cursor-pointer flex flex-col items-center justify-center ${
              isDragging
                ? 'border-orange-500 bg-orange-500/5'
                : 'border-zinc-800 hover:border-zinc-700 bg-[#12141a]/60 hover:bg-[#12141a]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Drag & Drop files here, or <span className="text-orange-400">browse</span>
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm">
              Files stream directly peer-to-peer via WebRTC DataChannels. Configured limit up to 10 GB.
            </p>
          </div>

          {/* Active Transfers Queue */}
          {activeTransfers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active Transfers</h3>
              <div className="space-y-2.5">
                {activeTransfers.map((session) => {
                  const percentage = Math.round((session.bytesTransferred / session.totalBytes) * 100) || 0;
                  return (
                    <div
                      key={session.fileId}
                      className="p-4 bg-[#14161d] border border-zinc-800 rounded-2xl shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileIcon className="w-4 h-4 text-orange-400 shrink-0" />
                          <span className="font-semibold text-zinc-200 truncate">{session.metadata.fileName}</span>
                          <span className="text-zinc-500 font-mono text-[11px]">({formatBytes(session.totalBytes)})</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {session.state === 'transferring' && (
                            <button
                              onClick={() => transferEngine.pauseTransfer(session.fileId)}
                              title="Pause"
                              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                            >
                              <Pause className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {session.state === 'paused' && (
                            <button
                              onClick={() => transferEngine.resumeTransfer(session.fileId)}
                              title="Resume"
                              className="p-1 rounded bg-orange-600 hover:bg-orange-500 text-white"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => transferEngine.cancelTransfer(session.fileId)}
                            title="Cancel"
                            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-red-400"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
                        <div
                          className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>

                      {/* Metrics Footer */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                        <span>
                          {percentage}% • {session.state === 'verifying' ? 'Verifying SHA-256...' : session.state}
                        </span>
                        <span>
                          {formatSpeed(session.speedBps)} • ETA: {formatEta(session.etaSeconds)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Files Gallery */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Shared In Room ({completedTransfers.length})
              </h3>
            </div>

            {completedTransfers.length === 0 ? (
              <div className="p-8 bg-[#12141a]/40 border border-zinc-800/60 rounded-2xl text-center text-xs text-zinc-500">
                No files transferred in this session yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {completedTransfers.map((s) => (
                  <div
                    key={s.fileId}
                    className="p-3.5 bg-[#14161d] border border-zinc-800 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="overflow-hidden">
                      <h4 className="text-xs font-semibold text-zinc-200 truncate">{s.metadata.fileName}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                        <span>{formatBytes(s.metadata.fileSize)}</span>
                        <span>•</span>
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          Verified
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setPreviewSession(s)}
                        title="Preview"
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {s.downloadUrl && (
                        <a
                          href={s.downloadUrl}
                          download={s.metadata.fileName}
                          title="Download"
                          className="p-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Real-Time Chat (Visible on 'chat' tab) */}
        <div className={`lg:col-span-3 ${activeTab === 'chat' ? 'block' : 'hidden lg:block'}`}>
          <div className="bg-[#12141a] border border-zinc-800 rounded-2xl flex flex-col h-[70vh] shadow-sm">
            {/* Chat Header */}
            <div className="p-3.5 border-b border-zinc-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-400" />
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Room Chat</h3>
            </div>

            {/* Messages Feed */}
            <div ref={chatScrollRef} className="flex-1 p-3.5 overflow-y-auto space-y-2.5 text-xs">
              {messages.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-[11px]">
                  No messages yet. Say hello to peers!
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="space-y-0.5">
                    {m.isSystem ? (
                      <div className="text-center py-1 text-[10px] text-zinc-400 font-medium italic">
                        {m.content}
                      </div>
                    ) : (
                      <div className="bg-zinc-900/80 border border-zinc-850 p-2.5 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-zinc-300">
                            {m.senderName} {m.isHost && <span className="text-orange-400 ml-1">(Host)</span>}
                          </span>
                          <span className="text-zinc-400 font-mono">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-zinc-200 break-words leading-relaxed">{m.content}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-2.5 border-t border-zinc-800 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                maxLength={1000}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden sticky bottom-0 z-40 w-full bg-[#12141a]/95 border-t border-zinc-800 backdrop-blur-md flex items-center justify-around py-2">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-4 cursor-pointer ${
            activeTab === 'files' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <FolderDown className="w-5 h-5" />
          <span>Files</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('chat');
            setUnreadChat(0);
          }}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-4 relative cursor-pointer ${
            activeTab === 'chat' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Chat</span>
          {unreadChat > 0 && (
            <span className="absolute top-0 right-3 w-4 h-4 bg-orange-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
              {unreadChat}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('peers')}
          className={`flex flex-col items-center gap-1 text-xs py-1 px-4 cursor-pointer ${
            activeTab === 'peers' ? 'text-orange-400 font-bold' : 'text-zinc-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Peers ({participants.length})</span>
        </button>
      </nav>

      {/* Modals */}
      {previewSession && (
        <FilePreviewModal
          session={previewSession}
          onClose={() => setPreviewSession(null)}
        />
      )}

      {/* Participant Leave Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#12141a] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Leave Room?</h3>
                <p className="text-xs text-zinc-400">You will disconnect from this file session.</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Any ongoing peer transfers with your device will stop immediately. You can rejoin at any time using the room code.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLeave}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Leave Dialog with Ownership Transfer */}
      {showHostLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-[#12141a] border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Host Departure</h3>
                <p className="text-xs text-zinc-400">Transfer room ownership before leaving</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              You are the room host. To keep the room open for remaining participants, choose a new host below. Alternatively, you can close the room for everyone.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400">Select New Host:</label>
              <select
                value={selectedNewHostId}
                onChange={(e) => setSelectedNewHostId(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
              >
                {participants
                  .filter((p) => p.id !== selfId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} ({p.deviceType})
                    </option>
                  ))}
              </select>
            </div>

            <div className="pt-3 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                onClick={() => setShowHostLeaveDialog(false)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCloseRoom}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-850 hover:bg-red-950/80 text-zinc-300 hover:text-red-300 border border-zinc-750 hover:border-red-800 transition cursor-pointer"
              >
                Close Room
              </button>
              <button
                onClick={handleHostLeaveWithTransfer}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/30 transition cursor-pointer"
              >
                Transfer & Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Host Close Room Permanent Confirmation Modal */}
      {showCloseRoomConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-[#12141a] border border-red-900/60 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400">
                <Power className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Permanently Close Room?</h3>
                <p className="text-xs text-red-300">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Closing this room will immediately terminate all peer connections, cancel active file transfers, and redirect all participants to the homepage.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowCloseRoomConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCloseRoom}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                Close Room Now
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && room && hostToken && (
        <HostSettingsModal
          room={room}
          hostToken={hostToken}
          participants={participants}
          onClose={() => setShowSettingsModal(false)}
          onRoomDeleted={() => {
            alert('Room has been deleted.');
            navigate('/');
          }}
          onSettingsUpdated={(newSettings, newName) => {
            setRoom((prev) => (prev ? { ...prev, name: newName || prev.name, settings: newSettings } : prev));
          }}
        />
      )}
    </div>
  );
};
