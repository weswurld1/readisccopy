"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type LocalTrackPublication,
  type Track as TrackType,
} from "livekit-client";

type Props = {
  url: string;
  token: string;
  me: string;
  avatars?: Record<string, string>;
  openProfile?: (h: string) => void;
  onLeave: () => void;
};

export default function VoiceRoom({
  url,
  token,
  me,
  avatars,
  openProfile,
  onLeave,
}: Props) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState("connecting…");
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    const refresh = () => {
      setParticipants([
        room.localParticipant.identity,
        ...Array.from(room.remoteParticipants.values()).map((p) => p.identity),
      ]);
    };

    const attach = (track: RemoteTrack | TrackType) => {
      if (track.kind === Track.Kind.Audio && audioRef.current) {
        audioRef.current.appendChild(track.attach());
      } else if (track.kind === Track.Kind.Video && videoRef.current) {
        const el = track.attach();
        el.setAttribute("data-sid", track.sid ?? "");
        videoRef.current.appendChild(el);
      }
    };

    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, (track) => attach(track as RemoteTrack))
      .on(RoomEvent.TrackUnsubscribed, (track) =>
        track.detach().forEach((el) => el.remove())
      )
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        if (pub.track && pub.track.kind === Track.Kind.Video) {
          attach(pub.track);
        }
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication) => {
        pub.track?.detach().forEach((el) => el.remove());
      })
      .on(RoomEvent.Disconnected, () => {
        if (!cancelled) setStatus("disconnected");
      });

    (async () => {
      try {
        await room.connect(url, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        setStatus("connected");
        refresh();
      } catch (e) {
        if (!cancelled) {
          setStatus(
            "error: " + (e instanceof Error ? e.message : "connect failed")
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
  }, [url, token]);

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    setMuted(next);
    await room.localParticipant.setMicrophoneEnabled(!next);
  }

  async function toggleShare() {
    const room = roomRef.current;
    if (!room) return;
    const next = !sharing;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch {
      // user cancelled the picker or capture failed
      setSharing(false);
    }
  }

  function leave() {
    roomRef.current?.disconnect();
    onLeave();
  }

  return (
    <div className="card">
      <div className="voice-status">
        <span className={`dot ${status === "connected" ? "on" : "off"}`} />
        {status === "connected" ? "Live audio connected" : status}
      </div>

      <h3 style={{ marginTop: 14 }}>In the room — {participants.length}</h3>
      {participants.length === 0 ? (
        <div className="hint">Connecting…</div>
      ) : (
        <div className="voice-grid">
          {participants.map((u) => {
            const url = avatars?.[u];
            return (
              <button
                className="voice-tile tile-btn"
                key={u}
                onClick={() => openProfile?.(u)}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="avatar-img"
                    style={{ width: 56, height: 56 }}
                    src={url}
                    alt={u}
                  />
                ) : (
                  <div
                    className="avatar-initials"
                    style={{ width: 56, height: 56 }}
                  >
                    {u.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="fname">
                  {u}
                  {u === me ? " (you)" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* shared screens (remote + your own preview) attach here */}
      <div ref={videoRef} className="screenshare-grid" />

      <div className="voice-controls">
        <button className={muted ? "ghost" : ""} onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button className={sharing ? "danger" : ""} onClick={toggleShare}>
          {sharing ? "Stop sharing" : "Share screen"}
        </button>
        <button className="danger" onClick={leave}>
          Leave
        </button>
      </div>

      {/* remote audio elements are attached here */}
      <div ref={audioRef} style={{ display: "none" }} />
    </div>
  );
}
