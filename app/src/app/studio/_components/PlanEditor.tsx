"use client";

import { useMemo, useState } from "react";
import type { FixedElementGeometry, PlanGeometry, RoomGeometry } from "@/server/geometry/types";
import styles from "./PlanEditor.module.css";

const GOLDEN_FAILURE = "This wall is not asking to be changed. HDB fixed elements stay untouched.";

interface PlanEditorProps {
  plan: PlanGeometry;
}

export default function PlanEditor({ plan }: PlanEditorProps) {
  const editableRooms = useMemo(
    () => plan.rooms.filter((room) => room.confidence !== "black" && room.kind !== "shelter"),
    [plan.rooms],
  );
  const lockedElements = plan.fixedElements;
  const [open, setOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(editableRooms[0]?.id ?? "");
  const [selectedLockedId, setSelectedLockedId] = useState(lockedElements[0]?.id ?? "");
  const [draftRooms, setDraftRooms] = useState<RoomGeometry[]>(plan.rooms);
  const [labelDraft, setLabelDraft] = useState(editableRooms[0]?.label ?? "");
  const [widthDraft, setWidthDraft] = useState(String(editableRooms[0]?.width ?? 1));
  const [heightDraft, setHeightDraft] = useState(String(editableRooms[0]?.height ?? 1));
  const [status, setStatus] = useState<string | null>(null);

  const selectedRoom = editableRooms.find((room) => room.id === selectedRoomId) ?? editableRooms[0];
  const selectedLocked = lockedElements.find((element) => element.id === selectedLockedId) ?? lockedElements[0];

  function selectRoom(roomId: string) {
    const room = editableRooms.find((candidate) => candidate.id === roomId);
    if (!room) return;
    setSelectedRoomId(room.id);
    setLabelDraft(room.label);
    setWidthDraft(String(room.width));
    setHeightDraft(String(room.height));
    setStatus(null);
  }

  function applyPreview() {
    if (!selectedRoom) return;
    const width = clampDimension(Number(widthDraft), 0.8, plan.bounds.width - selectedRoom.x);
    const height = clampDimension(Number(heightDraft), 0.8, plan.bounds.height - selectedRoom.y);
    const label = labelDraft.trim() || selectedRoom.label;

    setDraftRooms((rooms) =>
      rooms.map((room) =>
        room.id === selectedRoom.id
          ? { ...room, label, width, height }
          : room,
      ),
    );
    setWidthDraft(width.toFixed(1));
    setHeightDraft(height.toFixed(1));
    setStatus("Draft preview applied. Source plan remains locked.");
  }

  function resetDraft() {
    setDraftRooms(plan.rooms);
    if (selectedRoom) {
      setLabelDraft(selectedRoom.label);
      setWidthDraft(String(selectedRoom.width));
      setHeightDraft(String(selectedRoom.height));
    }
    setStatus("Draft reset. Curated geometry is unchanged.");
  }

  return (
    <section className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Edit plan draft
      </button>

      {open ? (
        <div className={styles.editor} role="region" aria-label="Reversible floor plan editor">
          <div className={styles.copy}>
            <span className={styles.eyebrow}>Plan editor</span>
            <p>Preview reversible room edits. Fixed HDB elements stay locked.</p>
          </div>

          <div className={styles.controls}>
            <label>
              <span>Editable room</span>
              <select
                aria-label="Editable room"
                value={selectedRoomId}
                onChange={(event) => selectRoom(event.currentTarget.value)}
              >
                {editableRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Room label</span>
              <input
                aria-label="Room label"
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Room width</span>
              <input
                aria-label="Room width"
                type="number"
                step="0.1"
                min="0.8"
                value={widthDraft}
                onChange={(event) => setWidthDraft(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Room depth</span>
              <input
                aria-label="Room depth"
                type="number"
                step="0.1"
                min="0.8"
                value={heightDraft}
                onChange={(event) => setHeightDraft(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Locked fixed element</span>
              <select
                aria-label="Locked fixed element"
                value={selectedLockedId}
                onChange={(event) => setSelectedLockedId(event.currentTarget.value)}
              >
                {lockedElements.map((element) => (
                  <option key={element.id} value={element.id}>
                    {formatLockedElement(element)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={applyPreview}>
              Apply preview
            </button>
            <button type="button" onClick={resetDraft}>
              Reset draft
            </button>
            <button type="button" onClick={() => setStatus(GOLDEN_FAILURE)}>
              Try editing locked element
            </button>
          </div>

          <svg
            className={styles.preview}
            viewBox={`${plan.bounds.x} ${plan.bounds.y} ${plan.bounds.width} ${plan.bounds.height}`}
            role="img"
            aria-label="Editable draft preview"
          >
            {draftRooms.map((room) => (
              <g key={room.id}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.width}
                  height={room.height}
                  className={room.id === selectedRoomId ? styles.roomSelected : styles.room}
                />
                <text x={room.x + room.width / 2} y={room.y + room.height / 2}>
                  {room.label}
                </text>
              </g>
            ))}
            {lockedElements.map((element) => (
              <rect
                key={element.id}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                className={element.id === selectedLocked?.id ? styles.lockedSelected : styles.locked}
              />
            ))}
          </svg>

          {status ? <p className={styles.status}>{status}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function clampDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatLockedElement(element: FixedElementGeometry): string {
  return element.kind.replaceAll("_", " ");
}
