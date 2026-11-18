import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, LogIn, ShieldAlert, Loader2 } from 'lucide-react';
import { api } from '../services/api.js';

interface JoinRoomModalProps {
  onClose: () => void;
  initialCode?: string;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ onClose, initialCode = '' }) => {
  const navigate = useNavigate();
  const [codeOrUrl, setCodeOrUrl] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanInput = (input: string): string => {
    let raw = input.trim();
    if (raw.includes('/room/')) {
      const parts = raw.split('/room/');
      return parts[1]?.split('?')[0]?.split('/')[0] || raw;
    }
    return raw.toUpperCase();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const identifier = cleanInput(codeOrUrl);
    if (!identifier) {
      setError('Please enter a 6-character room code or invite link.');
      setLoading(false);
      return;
    }

    try {
      // 1. Look up room info
      const roomData = await api.getRoom(identifier);

      if (roomData.isClosed) {
        throw new Error('This room has been permanently closed by the host.');
      }

      if (roomData.isLocked) {
        throw new Error('This room is currently locked by the host.');
      }

      if (roomData.isFull) {
        throw new Error('Room has reached its maximum participant capacity.');
      }

      const finalDisplayName = displayName.trim() || 'Guest';
      sessionStorage.setItem(`phoenix_name_${roomData.room.id}`, finalDisplayName);

      onClose();
      navigate(`/room/${roomData.room.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#12141a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
              <LogIn className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Join Private Room</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleJoin} className="p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Room Code or Invitation Link
            </label>
            <input
              type="text"
              required
              value={codeOrUrl}
              onChange={(e) => setCodeOrUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white font-mono placeholder-zinc-500 uppercase tracking-widest focus:outline-none focus:border-orange-500/80 transition"
              placeholder="e.g. 7X9K2M"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Your Display Name
            </label>
            <input
              type="text"
              required
              maxLength={32}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/80 transition"
              placeholder="e.g. Jordan"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-orange-600/30 flex items-center gap-2 transition cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Join Room</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
