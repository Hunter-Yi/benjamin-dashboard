import React, { useState, useEffect, useCallback } from "react";
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const AGENT_COLORS = {
  main: "#8b5cf6", researcher: "#3b82f6", builder: "#10b981", tester: "#f59e0b",
  integrator: "#ef4444", reviewer: "#ec4899", optimizer: "#06b6d4",
};

const COL_STYLES = {
  queued: { header: "text-purple-400", border: "border-purple-500/20" },
  todo: { header: "text-blue-400", border: "border-blue-500/20" },
  doing: { header: "text-amber-400", border: "border-amber-500/20" },
  done: { header: "text-emerald-400", border: "border-emerald-500/20" },
  hold: { header: "text-zinc-400", border: "border-zinc-500/20" },
};

const COL_LABELS = { queued: "작업대기", todo: "예정", doing: "진행중", done: "완료", hold: "보류" };

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function KanbanBoard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCard, setNewCard] = useState({ title: "", agent: "builder", tags: "", description: "", workdir: "" });
  const [addTarget, setAddTarget] = useState("todo"); // which column to add to
  const [selectedCard, setSelectedCard] = useState(null);
  const [editDesc, setEditDesc] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = useCallback(() => {
    fetch(`${import.meta.env.BASE_URL}api/kanban`).then((r) => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveData = useCallback((newData) => {
    setData(newData);
    fetch(`${import.meta.env.BASE_URL}api/kanban`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newData) })
      .then((r) => r.json())
      .then((res) => {
        // If cards were spawned (moved from queued to doing), poll after 1s
        if (res.spawned && res.spawned.length > 0) {
          setTimeout(() => fetchData(), 1000);
        }
      });
  }, [fetchData]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || !data) return;

    const cardId = active.id;
    const targetCol = over.id;

    // Find source column
    let sourceCol = null;
    for (const colId of data.columnOrder) {
      if (data.columns[colId]?.cardIds?.includes(cardId)) {
        sourceCol = colId;
        break;
      }
    }
    if (!sourceCol || sourceCol === targetCol) return;

    const newData = JSON.parse(JSON.stringify(data));
    newData.columns[sourceCol].cardIds = newData.columns[sourceCol].cardIds.filter((id) => id !== cardId);
    newData.columns[targetCol].cardIds.push(cardId);
    saveData(newData);
  }, [data, saveData]);

  const addCard = useCallback(() => {
    if (!newCard.title.trim() || !data) return;
    const id = `card-${Date.now()}`;
    const card = {
      id,
      title: newCard.title,
      agent: newCard.agent,
      createdAt: new Date().toISOString(),
      tags: newCard.tags.split(",").map((t) => t.trim()).filter(Boolean),
      description: newCard.description || "",
      workdir: newCard.workdir || "",
    };
    const newData = JSON.parse(JSON.stringify(data));
    newData.cards[id] = card;
    const targetColId = addTarget;
    if (newData.columns[targetColId]) {
      newData.columns[targetColId].cardIds.push(id);
    } else {
      newData.columns.todo.cardIds.push(id);
    }
    saveData(newData);
    setNewCard({ title: "", agent: "builder", tags: "", description: "", workdir: "" });
    setShowAdd(false);
  }, [data, newCard, addTarget, saveData]);

  const openCardModal = (card) => {
    setSelectedCard(card);
    setEditDesc(card.description || "");
  };

  const closeCardModal = () => {
    setSelectedCard(null);
    setEditDesc("");
  };

  const saveCardDesc = () => {
    if (!selectedCard || !data) return;
    const newData = JSON.parse(JSON.stringify(data));
    if (newData.cards[selectedCard.id]) {
      newData.cards[selectedCard.id].description = editDesc;
      saveData(newData);
      setSelectedCard({ ...selectedCard, description: editDesc });
    }
  };

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") closeCardModal(); };
    if (selectedCard) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [selectedCard]);

  if (loading || !data) return <Loading />;

  const colCount = data.columnOrder.length;
  const gridClass = colCount <= 3 ? "grid-cols-1 md:grid-cols-3" :
                    colCount === 4 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" :
                    "grid-cols-1 md:grid-cols-3 lg:grid-cols-5";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">칸반 보드</h2>
        <div className="flex gap-2">
          <button onClick={() => { setAddTarget("queued"); setShowAdd(!showAdd); }} className="text-sm bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            + 작업대기
          </button>
          <button onClick={() => { setAddTarget("todo"); setShowAdd(!showAdd); }} className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            + 새 카드
          </button>
        </div>
      </div>

      {/* Add Card Form */}
      {showAdd && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-400">추가 대상:</span>
            <span className={`text-xs font-semibold ${COL_STYLES[addTarget]?.header || "text-zinc-300"}`}>{COL_LABELS[addTarget]}</span>
          </div>
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
            placeholder="작업명..."
            value={newCard.title}
            onChange={(e) => setNewCard({ ...newCard, title: e.target.value })}
          />
          {(addTarget === "queued") && (
            <>
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 resize-none"
                rows={2}
                placeholder="작업 상세 설명..."
                value={newCard.description}
                onChange={(e) => setNewCard({ ...newCard, description: e.target.value })}
              />
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
                placeholder="작업 디렉토리 (workdir)..."
                value={newCard.workdir}
                onChange={(e) => setNewCard({ ...newCard, workdir: e.target.value })}
              />
            </>
          )}
          <div className="flex gap-3">
            <select
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
              value={newCard.agent}
              onChange={(e) => setNewCard({ ...newCard, agent: e.target.value })}
            >
              {Object.keys(AGENT_COLORS).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
              placeholder="태그 (쉼표 구분)"
              value={newCard.tags}
              onChange={(e) => setNewCard({ ...newCard, tags: e.target.value })}
            />
            <button onClick={addCard} className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm transition-colors">추가</button>
          </div>
        </div>
      )}

      {/* Board */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className={`grid ${gridClass} gap-4`}>
          {data.columnOrder.map((colId) => {
            const col = data.columns[colId];
            if (!col) return null;
            const style = COL_STYLES[colId] || COL_STYLES.todo;
            return (
              <KanbanColumn key={colId} id={colId} col={col} style={style} cards={data.cards} label={COL_LABELS[colId] || col.title} onCardClick={openCardModal} />
            );
          })}
        </div>
      </DndContext>

      {/* Card Detail Modal */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeCardModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: AGENT_COLORS[selectedCard.agent] || "#6b7280" }} />
                <h3 className="font-semibold text-zinc-100">{selectedCard.title}</h3>
              </div>
              <button onClick={closeCardModal} className="text-zinc-500 hover:text-zinc-300 text-lg">&times;</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500 text-xs">에이전트</span>
                  <div className="text-zinc-200 mt-0.5">{selectedCard.agent}</div>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">생성일</span>
                  <div className="text-zinc-200 mt-0.5">{formatDateTime(selectedCard.createdAt)}</div>
                </div>
                {selectedCard.workdir && (
                  <div className="col-span-2">
                    <span className="text-zinc-500 text-xs">작업 디렉토리</span>
                    <div className="text-zinc-200 mt-0.5 font-mono text-xs">{selectedCard.workdir}</div>
                  </div>
                )}
                {selectedCard.started_at && (
                  <div>
                    <span className="text-zinc-500 text-xs">시작일</span>
                    <div className="text-zinc-200 mt-0.5">{formatDateTime(selectedCard.started_at)}</div>
                  </div>
                )}
                {selectedCard.completed_at && (
                  <div>
                    <span className="text-zinc-500 text-xs">완료일</span>
                    <div className="text-zinc-200 mt-0.5">{formatDateTime(selectedCard.completed_at)}</div>
                  </div>
                )}
              </div>

              {selectedCard.tags?.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {selectedCard.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
              )}

              <div>
                <label className="text-zinc-500 text-xs block mb-1">설명</label>
                <textarea
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 resize-none"
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="작업 설명 입력..."
                />
                {editDesc !== (selectedCard.description || "") && (
                  <button
                    onClick={saveCardDesc}
                    className="mt-2 text-sm bg-violet-600 hover:bg-violet-500 text-white px-3 py-1 rounded-lg transition-colors"
                  >
                    저장
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ id, col, style, cards, label, onCardClick }) {
  return (
    <SortableContext id={id} items={col.cardIds} strategy={verticalListSortingStrategy}>
      <div className={`rounded-xl border ${style.border} bg-zinc-900/40 p-3 min-h-[300px]`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${style.header}`}>{label}</h3>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{col.cardIds.length}</span>
        </div>
        <div className="space-y-2">
          {col.cardIds.map((cardId) => {
            const card = cards[cardId];
            if (!card) return null;
            return <KanbanCard key={cardId} card={card} columnId={id} onCardClick={onCardClick} />;
          })}
        </div>
      </div>
    </SortableContext>
  );
}

function KanbanCard({ card, columnId, onCardClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId },
  });

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      onClick={() => onCardClick(card)}
      className="bg-zinc-800/80 border border-zinc-700/50 rounded-lg p-3 cursor-grab hover:border-zinc-600 transition-colors"
    >
      <div className="text-sm text-zinc-200 font-medium mb-2">{card.title}</div>
      {card.description && (
        <div className="text-xs text-zinc-500 mb-2 truncate">{card.description}</div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: AGENT_COLORS[card.agent] || "#6b7280" }} />
          <span className="text-xs text-zinc-400">{card.agent}</span>
        </div>
        <div className="flex gap-1">
          {card.tags?.map((tag) => (
            <span key={tag} className="text-[10px] bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  );
}
