/**
 * 无 UI 时在 background 控制台调用的示例。
 */
import {
    createCountdownTask,
    createScheduleTask,
    createTaskFromTemplate,
    listTasks,
    minutes,
    qqFarmDurationMs,
    restartTask,
    seconds,
    setTaskPinned,
    spawnCountdownInstance,
    updateTask,
} from './index.js';

export async function runDevExamples() {
    const schedule = await createScheduleTask({
        title: '吃药提醒',
        time: '14:30',
        repeatDays: [1, 2, 3, 4, 5],
        enabled: true,
    });
    console.log('[Timer] 定时预设', schedule);

    const preset = await createCountdownTask({
        title: '休息 15 分钟',
        durationMs: minutes(15),
        isFavorite: true,
    });
    const instance = await spawnCountdownInstance(preset.id, {startImmediately: true});
    console.log('[Timer] 倒计时实例', instance);

    const pomodoro = await createTaskFromTemplate('pomodoro', {startNow: false});
    console.log('[Timer] 番茄模板预设', pomodoro);

    const farm = await createTaskFromTemplate('qq_farm', {
        durationMs: qqFarmDurationMs(8, 0.1),
    });
    console.log('[Timer] 农场模板', farm);

    await setTaskPinned(schedule.id, true);
    await updateTask(schedule.id, {reminderMode: 'blocking'});

    console.log('[Timer] 全部任务（已排序）', await listTasks());
    console.log('[Timer] 仅预设', await listTasks({role: 'preset'}));
    console.log('[Timer] 仅实例', await listTasks({role: 'instance'}));

    return listTasks();
}
