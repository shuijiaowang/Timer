// import {defineContentScript} from "#imports"; //可省略

export default defineContentScript({
    matches: ['<all_urls>'], //全匹配
    // matches: ['https://www.bilibili.com/video/*'],//具体匹配
    // matches: ['*://*.google.com/*'],//http+https
    // excludeMatches: ["https://www.bilibili.com/live/*"],//排除某些页面（不注入）
    // runAt: 'document_start',//网页刚创建，DOM 还没开始解析
    // runAt: 'document_end',//DOM 解析完成，图片等资源还没加载
    runAt: 'document_idle',//页面完全加载完成
    // allFrames: true,            //iframe（子框架）等也注入
    // allFrames: false,          // 只主页面

    // 脚本注入后执行的核心逻辑
    async main() {
        // 调用业务模块的初始化函数
        console.log("插件初始化")
    },
});
