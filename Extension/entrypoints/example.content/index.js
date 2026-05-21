
export default defineContentScript({
    matches: ['https://www.example.com/*'],
    runAt: 'document_idle',//页面完全加载完成
    // 脚本注入后执行的核心逻辑
    main() {
        // 调用业务模块的初始化函数
        console.log("Example Content Script")
    },
});
