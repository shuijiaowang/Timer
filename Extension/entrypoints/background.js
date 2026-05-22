import {
    cancelTask,
    createCountdownTask,
    createQueueTask,
    createScheduleTask,
    getTaskSnapshot,
    initTaskEngine,
    listTasks,
    startCountdownTask,
    startQueueTask,
} from '../core/tasks/index.js';

export default defineBackground(() => {
    console.log('Background script started', {id: browser.runtime.id});

    initTaskEngine();

    browser.runtime.onMessage.addListener(async (message) => {
        if (message.type === 'popup_opened') {
            console.log('popup 已打开');
            const currentWindow = await browser.windows.getCurrent();
            const width = Math.max(currentWindow.width - 400, 300);
            const height = Math.max(currentWindow.height - 300, 200);
            const left = Math.round((currentWindow.width - width) / 2);
            const top = Math.round((currentWindow.height - height) / 2);
            await browser.windows.create({
                url: '/popup_true.html',
                type: 'popup',
                width,
                height,
                left,
                top,
            });
            return;
        }

        if (message.type === 'timer_task') {
            const {action, payload = {}} = message;
            try {
                switch (action) {
                    case 'createSchedule':
                        return {
                            ok: true,
                            task: await createScheduleTask(payload),
                        };
                    case 'createCountdown':
                        return {
                            ok: true,
                            task: await createCountdownTask(payload),
                        };
                    case 'createQueue':
                        return {
                            ok: true,
                            task: await createQueueTask(payload),
                        };
                    case 'startCountdown':
                        return {
                            ok: true,
                            task: await startCountdownTask(payload.id),
                        };
                    case 'startQueue':
                        return {
                            ok: true,
                            task: await startQueueTask(payload.id),
                        };
                    case 'cancel':
                        return {
                            ok: true,
                            task: await cancelTask(payload.id),
                        };
                    case 'list':
                        return {ok: true, tasks: await listTasks()};
                    case 'get':
                        return {ok: true, task: await getTaskSnapshot(payload.id)};
                    default:
                        return {ok: false, error: `未知 action: ${action}`};
                }
            } catch (err) {
                return {ok: false, error: err?.message ?? String(err)};
            }
        }
    });
});
