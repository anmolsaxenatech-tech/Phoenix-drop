import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Users, Clock, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../services/api.js';

interface CreateRoomModalProps {
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('Host');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [expirationHours, setExpirationHours] = useState(24);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);
  const [downloadsEnabled, setDownloadsEnabled] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDeviceType = (): 'desktop' | 'mobile' | 'tablet' => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a room name.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.createRoom({
        name: trimmedName,
        displayName: displayName.trim() || 'Host',
        deviceType: getDeviceType(),
        settings: {
          maxParticipants,
          expirationHours,
          uploadsEnabled,
          downloadsEnabled,
          chatEnabled
        }
      });

      // Save credentials in session storage for reconnects
      sessionStorage.setItem(`phoenix_host_${response.room.id}`, response.hostToken);
      sessionStorage.setItem(`phoenix_token_${response.room.id}`, response.participantToken);
      sessionStorage.setItem(`phoenix_name_${response.room.id}`, displayName.trim() || 'Host');

      onClose();
      navigate(`/room/${response.room.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#12141a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white">Create Private Room</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-6 overflow-y-auto space-y-4 text-sm">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Room Name <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/80 transition"
              placeholder="e.g. Design Handover, Sprint Planning"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Your Display Name</label>
            <input
              type="text"
              required
              maxLength={32}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500/80 transition"
              placeholder="e.g. Alex"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-zinc-400" />
                <span>Max Peers</span>
              </label>
              <select
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500 transition"
              >
                <option value={2}>2 Peers</option>
                <option value={5}>5 Peers</option>
                <option value={10}>10 Peers (Default)</option>
                <option value={16}>16 Peers (Max)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Expiration</span>
              </label>
              <select
                value={expirationHours}
                onChange={(e) => setExpirationHours(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-orange-500 transition"
              >
                <option value={1}>1 Hour</option>
                <option value={6}>6 Hours</option>
                <option value={24}>24 Hours (Default)</option>
                <option value={72}>72 Hours</option>
              </select>
            </div>
          </div>

          <div className="pt-2 space-y-2 border-t border-zinc-800/80">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Permissions</span>
            
            <label className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded-xl cursor-pointer hover:bg-zinc-900 transition">
              <span className="text-xs text-zinc-200">Allow File Uploads</span>
              <input
                type="checkbox"
                checked={uploadsEnabled}
                onChange={(e) => setUploadsEnabled(e.target.checked)}
                className="accent-orange-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded-xl cursor-pointer hover:bg-zinc-900 transition">
              <span className="text-xs text-zinc-200">Allow File Downloads</span>
              <input
                type="checkbox"
                checked={downloadsEnabled}
                onChange={(e) => setDownloadsEnabled(e.target.checked)}
                className="accent-orange-500 w-4 h-4 cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-800/60 rounded-xl cursor-pointer hover:bg-zinc-900 transition">
              <span className="text-xs text-zinc-200">Enable Room Chat</span>
              <input
                type="checkbox"
                checked={chatEnabled}
                onChange={(e) => setChatEnabled(e.target.checked)}
                className="accent-orange-500 w-4 h-4 cursor-pointer"
              />
            </label>
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
                  <span>Creating Room...</span>
                </>
              ) : (
                <span>Launch Room</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
