"use client";

import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from "livekit-client";

type Props = {
  url: string;
  token: string;
  me: string;
  onLeave: () => void;
};

export default function VoiceRoom({ url, token, me, onLeave }: Props) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("connecting…");
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    const refresh = () => {
      const names = [
        room.localParticipant.identity,
        ...Array.from(room.remoteParticipants.values()).map((p) => p.identity),
      ];
      setParticipants(names);
    };

    const attach = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio && audioRef.current) {
        audioRef.current.appendChild(track.attach());
      }
    };

    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, (track) => attach(track as RemoteTrack))
      .on(RoomEvent.TrackUnsubscribed, (track) =>
        track.detach().forEach((el) => el.remove())
      )
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

  function leave() {
    roomRef.current?.disconnect();
    onLeave();
  }

  return (
    <div className="card">
      <div className="voice-status">
        <span
          className={`dot ${status === "connected" ? "on" : "off"}`}
        />
        {status === "connected" ? "Live audio connected" : status}
      </div>

      <h3 style={{ marginTop: 14 }}>In the room — {participants.length}</h3>
      {participants.length === 0 ? (
        <div className="hint">Connecting…</div>
      ) : (
        <div className="voice-grid">
          {participants.map((u) => (
            <div className="voice-tile" key={u}>
              <div className="avatar">{u.slice(0, 2).toUpperCase()}</div>
              <span className="fname">
                {u}
                {u === me ? " (you)" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="voice-controls">
        <button className={muted ? "ghost" : ""} onClick={toggleMute}>
          {muted ? "Unmute" : "Mute"}
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
