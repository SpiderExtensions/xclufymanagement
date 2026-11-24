import React, { useEffect, useState } from 'react';
import { Bell, BellRing, CheckCheck, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getActiveServiceWorkerRegistration } from '../lib/swRegister';
import type { AppNotification, ModuleKey, UserProfile } from '../shared/types';
import { EmptyState, PageHeader, SkeletonRows } from '../components/ui/Primitives';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const NotificationsPage: React.FC<{
  user: UserProfile;
  onUserUpdated: (user: UserProfile) => void;
  onNavigate: (mod: ModuleKey) => void;
  onUnreadChange: (count: number) => void;
}> = ({ user, onUserUpdated, onNavigate, onUnreadChange }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [subCount, setSubCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState('');
  const [pushError, setPushError] = useState('');

  const pushSupported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        notifications: AppNotification[];
        unread_count: number;
        push_subscription_count: number;
      }>('/api/notifications');
      setNotifications(res.notifications);
      setSubCount(res.push_subscription_count);
      onUnreadChange(res.unread_count);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const handleEnablePush = async () => {
    setPushError('');
    setPushStatus('');
    if (!pushSupported) {
      setPushError('Web Push notifications are unavailable in this browser or context. In-app notifications remain active.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError('Notification permission was declined. Enable notifications in browser site settings to receive mobile alerts.');
        return;
      }

      const registration = await getActiveServiceWorkerRegistration();
      if (!registration) {
        setPushError('Service Worker is unavailable inside an embedded preview frame. Open XCLUFY in a standalone tab or installed PWA to enable Web Push.');
        return;
      }
      const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/vapid-key');
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_label: navigator.userAgent.includes('Android')
            ? 'Android Mobile'
            : navigator.userAgent.includes('iPhone')
              ? 'iOS Device'
              : 'Desktop / Web Device',
        }),
      });

      setPushStatus('Real-time Web Push subscribed for this device.');
      await loadNotifications();
    } catch (err: unknown) {
      setPushError((err as Error).message || 'Could not register push subscription on this device.');
    }
  };

  const handleDisablePush = async () => {
    setPushError('');
    try {
      if ('serviceWorker' in navigator) {
        const reg = await getActiveServiceWorkerRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          await apiFetch('/api/push/subscribe', {
            method: 'DELETE',
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      setPushStatus('Push subscription removed from this device.');
      await loadNotifications();
    } catch (err: unknown) {
      setPushError((err as Error).message || 'Failed to unsubscribe.');
    }
  };

  const handleSendTestPush = async () => {
    setPushError('');
    setPushStatus('');
    try {
      const res = await apiFetch<{ sent: number; failed: number }>('/api/push/test', { method: 'POST' });
      setPushStatus(`Push delivered to ${res.sent} registered device(s).`);
    } catch (err: unknown) {
      setPushError((err as Error).message || 'Push delivery failed.');
    }
  };

  const handleMarkRead = async (n: AppNotification) => {
    if (n.is_read === 0) {
      await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
      await loadNotifications();
    }
    if (n.link_module) {
      onNavigate(n.link_module as ModuleKey);
    }
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadNotifications();
  };

  const togglePref = async (key: keyof UserProfile['notification_prefs']) => {
    const updated = { ...user.notification_prefs, [key]: !user.notification_prefs[key] };
    const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ notification_prefs: updated }),
    });
    onUserUpdated(res.user);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications & Push Alerts"
        subtitle="Manage real-time mobile Web Push subscriptions (VAPID), alert categories, and notification history"
        actions={
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs font-medium hover:bg-white/10"
          >
            <CheckCheck className="h-4 w-4" />
            Mark All Read
          </button>
        }
      />

      {/* Push Setup Card */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#181818]">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Mobile &amp; Browser Push Delivery</h2>
              <p className="text-xs text-zinc-400">
                Active push devices on your account: <span className="font-mono text-white">{subCount}</span>
                {!pushSupported && ' · Push API unavailable on this browser (in-app alerts active)'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleEnablePush()}
              className="rounded-lg bg-zinc-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#080808]"
            >
              Enable Push on This Device
            </button>
            {subCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void handleSendTestPush()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium hover:bg-white/10"
                >
                  <Send className="h-3.5 w-3.5" />
                  Test Push
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisablePush()}
                  className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
                >
                  Disable
                </button>
              </>
            )}
          </div>
        </div>

        {pushStatus && (
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            <span>{pushStatus}</span>
          </p>
        )}
        {pushError && (
          <p className="text-xs text-amber-300 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            <span>{pushError}</span>
          </p>
        )}

        <div className="border-t border-white/10 pt-4 flex flex-wrap gap-4 text-xs">
          {[
            { key: 'account_events', label: 'Account Events' },
            { key: 'business_events', label: 'Orders, Payments & Stock' },
            { key: 'shareholder_events', label: 'Shareholder Updates' },
            { key: 'admin_events', label: 'Admin Alerts' },
          ].map((c) => (
            <label key={c.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(user.notification_prefs[c.key as keyof UserProfile['notification_prefs']])}
                onChange={() => void togglePref(c.key as keyof UserProfile['notification_prefs'])}
                className="h-4 w-4 accent-white"
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* History */}
      {loading ? (
        <SkeletonRows rows={4} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No Notifications Yet"
          description="New registrations, orders, payments, low-stock alerts, and shareholder updates appear here."
        />
      ) : (
        <div className="divide-y divide-zinc-200 dark:divide-white/10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212]">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void handleMarkRead(n)}
              className={`w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-white/[0.03] transition-colors ${
                n.is_read === 0 ? 'bg-white/[0.02]' : 'opacity-75'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{n.title}</span>
                  {n.is_read === 0 && <span className="text-[11px] font-mono text-amber-400">Unread</span>}
                </div>
                <p className="text-xs text-zinc-400">{n.message}</p>
                <p className="text-[11px] font-mono text-zinc-500">
                  {n.category} · {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
