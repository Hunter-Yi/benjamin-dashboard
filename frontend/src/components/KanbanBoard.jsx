import React, { useState, useEffect, useCallback } from "react";
import { DndContext, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const AGENT_COLORS = {
  main: "#8b5cf6", researcher: "#3b82f6", builder: "#10b981", tester: "#f59e0b",
  integrator: "#ef4444", reviewer: "#ec4899", optimizer: "#06b6d4",
};

const COL_STYLES = {
  todo: { header: "text-blue-400", border: "border-blue-500/20" },
  doing: { header: "text-amber-400", border: "border-amber-500/20" },
  done: { header: "text-emerald-400", border: "border-emerald-500/20" },
};

const COL_LABELS = { todo: "예정", doing: "진행중", done: "완료" };

export default function KanbanBoard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCard, setNewCard] = useState({ title: "", agent: "main", tags: "" });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = useCallback(() => {
    fetch("/api/kanban").then((r) => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveData = useCallback((newData) => {
    setData(newData);
    fetch("/api/kanban", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newData) });
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || !data) return;

    const cardId = active.id;
    const targetCol = over.id;

    // Find source column
    let sourceCol = null;
    for (const colId of data.columnOrder) {
      if (data.columns[colId].cardIds.includes(cardId)) {
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
    };
    const newData = JSON.parse(JSON.stringify(data));
    newData.cards[id] = card;
    newData.columns.todo.cardIds.push(id);
    saveData(newData);
    setNewCard({ title: "", agent: "main", tags: "" });
    setShowAdd(false);
  }, [data, newCard, saveData]);

  if (loading || !data) return <Loading />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">칸반 보드</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          + 새 카드
        </button>
      </div>

      {/* Add Card Form */}
      {showAdd && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mb-4 space-y-3">
          <input
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
            placeholder="작업명..."
            value={newCard.title}
            onChange={(e) => setNewCard({ ...newCard, title: e.target.value })}
          />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.columnOrder.map((colId) => {
            const col = data.columns[colId];
            const style = COL_STYLES[colId] || COL_STYLES.todo;
            return (
              <KanbanColumn key={colId} id={colId} col={col} style={style} cards={data.cards} label={COL_LABELS[colId]} />
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

function KanbanColumn({ id, col, style, cards, label }) {
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
            return <KanbanCard key={cardId} card={card} columnId={id} />;
          })}
        </div>
      </div>
    </SortableContext>
  );
}

function KanbanCard({ card, columnId }) {
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
      className="bg-zinc-800/80 border border-zinc-700/50 rounded-lg p-3 cursor-grab hover:border-zinc-600 transition-colors"
    >
      <div className="text-sm text-zinc-200 font-medium mb-2">{card.title}</div>
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
