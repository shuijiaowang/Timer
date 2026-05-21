export default defineBackground(() => {
    console.log('Background script started', {id: browser.runtime.id});
    browser.action.onClicked.addListener((tab) => {
        console.log('扩展图标被点击', tab);
    });
    browser.runtime.onMessage.addListener(async (message) => {
        if (message.type === 'popup_opened') {
            console.log('popup 已打开');
            const currentWindow = await browser.windows.getCurrent();
            const width = Math.max(currentWindow.width - 400, 300);
            const height = Math.max(currentWindow.height - 300, 200);
            const left = Math.round((currentWindow.width - width) / 2);
            const top = Math.round((currentWindow.height - height) / 2);
            // 打开居中窗口
            await browser.windows.create({
                url: "/popup_true.html", // 你的 popup 页面 //这里需要是实际的popup.html，而不是/popup/index.html,不然会找不到
                type: "popup", // 无边栏窗口
                // type: "normal", // 无边栏窗口
                width,
                height,
                left,
                top,
            });
        }
    });


})




