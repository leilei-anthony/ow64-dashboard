import type { Task } from '../model/types';
import { taskStatus, type TaskStatus } from '../lib/tasks';

const LABEL: Record<TaskStatus, string> = { todo: 'Not done', partial: 'In progress', done: 'Done' };
const NEXT: Record<TaskStatus, string> = { todo: 'mark it in progress', partial: 'mark it done', done: 'mark it not done' };
const ARIA: Record<TaskStatus, 'false' | 'mixed' | 'true'> = { todo: 'false', partial: 'mixed', done: 'true' };

/** The task box: [ ] not done · [/] in progress · [x] done. Each click moves to the next state. */
export function TaskStatusBox({ task, onCycle }: { task: Task; onCycle: () => void }) {
  const status = taskStatus(task);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={ARIA[status]}
      aria-label={`${task.text}: ${LABEL[status]}`}
      title={`${LABEL[status]}. Click to ${NEXT[status]}.`}
      class={`task-box is-${status}`}
      onClick={onCycle}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {status === 'partial' && <path d="M4.5 11.5l7-7" />}
        {status === 'done' && <path d="M3.8 8.4l2.7 2.7 5.7-6" />}
      </svg>
    </button>
  );
}
