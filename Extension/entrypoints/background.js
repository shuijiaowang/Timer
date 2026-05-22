import {
    cancelTask,
    createCountdownTask,
    createLoopTask,
    createQueueTask,
    createScheduleTask,
    createTaskFromTemplate,
    deleteTask,
    getTaskSnapshot,
    initTaskEngine,
    listBuiltinTemplates,
    listTasks,
    restartTask,
    setTaskEnabled,
    setTaskPinned,
    spawnCountdownInstance,
    startCountdownTask,
    startLoopTask,
    startQueueTask,
    updateTask,
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
                        return {ok: true, task: await createScheduleTask(payload)};
                    case 'createCountdown':
                        return {ok: true, task: await createCountdownTask(payload)};
                    case 'createLoop':
                        return {ok: true, task: await createLoopTask(payload)};
                    case 'createQueue':
                        return {ok: true, task: await createQueueTask(payload)};
                    case 'createFromTemplate':
                        return {ok: true, task: await createTaskFromTemplate(payload.templateId, payload.overrides)};
                    case 'spawnCountdown':
                        return {
                            ok: true,
                            task: await spawnCountdownInstance(payload.id, payload.options),
                        };
                    case 'startCountdown':
                        return {ok: true, task: await startCountdownTask(payload.id)};
                    case 'startLoop':
                        return {ok: true, task: await startLoopTask(payload.id)};
                    case 'startQueue':
                        return {ok: true, task: await startQueueTask(payload.id)};
                    case 'restart':
                        return {ok: true, task: await restartTask(payload.id)};
                    case 'update':
                        return {ok: true, task: await updateTask(payload.id, payload.patch)};
                    case 'setEnabled':
                        return {ok: true, task: await setTaskEnabled(payload.id, payload.enabled)};
                    case 'setPinned':
                        return {ok: true, task: await setTaskPinned(payload.id, payload.pinned)};
                    case 'delete':
                        return {ok: true, task: await deleteTask(payload.id)};
                    case 'cancel':
                        return {ok: true, task: await cancelTask(payload.id)};
                    case 'list':
                        return {ok: true, tasks: await listTasks(payload)};
                    case 'listTemplates':
                        return {ok: true, templates: listBuiltinTemplates()};
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
