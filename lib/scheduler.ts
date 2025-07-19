
type Task = {
    id: string;
    fn: () => void;
    scheduledTime: number;
    timeout: NodeJS.Timeout;
}
  
export default class TaskScheduler {
    private tasks: Map<string, Task> = new Map();

    schedule(id: string, fn: () => void, delayMinutes: number): void {
        this.cancel(id);

        const timeout = setTimeout(() => {
        fn();
        this.tasks.delete(id);
        }, delayMinutes * 60 * 1000);

        this.tasks.set(id, {
        id,
        fn,
        scheduledTime: Date.now() + (delayMinutes * 60 * 1000),
        timeout
        });
    }

    cancel(id: string): boolean {
        const task = this.tasks.get(id);
        if (task) {
        clearTimeout(task.timeout);
        this.tasks.delete(id);
        return true;
        }
        return false;
    }

    getTimeRemaining(id: string): number | null {
        const task = this.tasks.get(id);
        if (task) {
        return Math.max(0, task.scheduledTime - Date.now());
        }
        return null;
    }

    getAllTasks(): Array<{ id: string; scheduledTime: number }> {
        return Array.from(this.tasks.values()).map(({ id, scheduledTime }) => ({
        id,
        scheduledTime
        }));
    }
}