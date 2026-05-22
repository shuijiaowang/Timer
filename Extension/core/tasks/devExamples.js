/**
 * 无 UI 时在 background 控制台或消息里调用的示例。
 * 用法（扩展 Service Worker 控制台）:
 *   import { runDevExamples } from './core/tasks/devExamples.js';
 *   await runDevExamples();
 */
import {
    createCountdownTask,
    createQueueTask,
    createScheduleTask,
    listTasks,
    minutes,
    seconds,
} from './index.js';

export async function runDevExamples() {
    const schedule = await createScheduleTask({
        title: '吃药提醒',
        time: '14:30',
    });
    console.log('[Timer] 定时任务已创建', schedule);

    const countdown = await createCountdownTask({
        title: '休息 15 分钟',
        durationMs: minutes(15),
    });
    console.log('[Timer] 倒计时已创建', countdown);

    const queue = await createQueueTask({
        title: '演示队列 15s + 30s',
        steps: [
            {title: '第一段', durationMs: seconds(15)},
            {title: '第二段', durationMs: seconds(30)},
        ],
    });
    console.log('[Timer] 队列任务已创建', queue);

    console.log('[Timer] 全部任务', await listTasks());
}
