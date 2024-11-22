//Version:1.5.0
//Date:2024-11-22 10:50:47

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

//防止被滥用，在添加车辆信息时需要用来鉴权
const API_KEY = "sk-@Admin123";
const notifyMessage = "您好，有人需要您挪车，请及时处理。";
const sendSuccessMessage = "您好，我已收到你的挪车通知，我正在赶来的路上，请稍等片刻！";
//300秒内可发送5次通知
const rateLimitDelay = 300;
const rateLimitMaxRequests = 5;
//达到速率限制时返回内容
const rateLimitMessage = "我正在赶来的路上,请稍等片刻~~~";

//通知类型，其他的通知类型可自行实现
const notifyTypeMap = [
    { "id": "1", "name": "WxPusher", "functionName": wxpusher, "tip": "\r\nAT_xxxxxx|UID_xxxxxx" },
    { "id": "2", "name": "Bark", "functionName": bark, "tip": "\r\ntoken|soundName\r\n\r\n注：token为xxxxxx代表的值，直接输入该值即可，请勿输入完整链接（https://api.day.app/xxxxxx），soundName为铃声名称（默认使用：multiwayinvitation），如需自定义铃声需要把铃声文件先上传到BarkApp" },
    { "id": "3", "name": "飞书机器人", "functionName": feishu, "tip": "\r\ntoken\r\n\r\n注：token为xxxxxx代表的值，直接输入该值即可，请勿输入完整链接（https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx）" },
    { "id": "4", "name": "企业微信机器人", "functionName": weixin, "tip": "\r\ntoken\r\n\r\n注：token为xxxxxx代表的值，直接输入该值即可，请勿输入完整链接（https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxx）" },
    { "id": "5", "name": "钉钉机器人", "functionName": dingtalk, "tip": "\r\ntoken\r\n\r\n注：token为xxxxxx代表的值，直接输入该值即可，请勿输入完整链接（https://oapi.dingtalk.com/robot/send?access_token=xxxxxx）" },
    { "id": "6", "name": "NapCatQQ", "functionName": onebot, "tip": "http://127.0.0.1:8000/send_private_msg|access_token|接收人QQ号" },
    { "id": "7", "name": "Lagrange.Onebot", "functionName": onebot, "tip": "http://127.0.0.1:8000/send_private_msg|access_token|接收人QQ号" }
]

async function handleRequest(request) {
    try {
        const url = new URL(request.url);
        const pathname = url.pathname;
        if (request.method === "OPTIONS") {
            return getResponse("", 204);
        }
        else if (request.method == "POST") {
            if (pathname == '/api/notifyOwner') {
                const json = await request.json();
                return await notifyOwner(json);
            }
            else if (pathname == '/api/callOwner') {
                const json = await request.json();
                return await callOwner(json);
            }
            else if (pathname == '/api/addOwner') {
                if (!isAuth(request)) {
                    return getResponse(JSON.stringify({ code: 500, data: "Auth error", message: "fail" }), 200);
                }
                const json = await request.json();
                return await addOwner(json);
            }
            else if (pathname == '/api/deleteOwner') {
                if (!isAuth(request)) {
                    return getResponse(JSON.stringify({ code: 500, data: "Auth error", message: "fail" }), 200);
                }
                const json = await request.json();
                return await deleteOwner(json);
            }
            else if (pathname == '/api/listOwner') {
                if (!isAuth(request)) {
                    return getResponse(JSON.stringify({ code: 500, data: "Auth error", message: "fail" }), 200);
                }
                return await listOwner();
            }
            else if (pathname == '/api/notifyTypeList') {
                return getNotifyTypeList();
            }
            else if (pathname == '/api/login') {
                const { apiKey } = await request.json();
                if (apiKey && apiKey == API_KEY) {
                    return getResponse(JSON.stringify({ code: 200, data: "Authorized", message: "success" }), 200);
                }
                else {
                    return getResponse(JSON.stringify({ code: 401, data: "Unauthorized", message: "fail" }), 200);
                }
            }
        }
        else if (request.method == "GET") {
            if (pathname == "/login") {
                return login();
            }
            else if (pathname == "/manager") {
                return managerOwnerIndex();
            }
            else {
                const style = url.searchParams.get("style") || "1";
                const id = url.searchParams.get("id") || "";
                return style == "2" ? await index2(id) : await index1(id);
            }
        }
    } catch (error) {
        return getResponse(JSON.stringify({ code: 500, data: error.message, message: "fail" }), 200);
    }
}

function isAuth(request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== API_KEY) {
        return false;
    }
    else {
        return true;
    }
}

async function getKV(id) {
    try {
        if (id) {
            const owner = await DATA.get(id) || null;
            if (owner) {
                return JSON.parse(owner);
            }
        }
    } catch (e) {
    }
    return null;
}

async function putKV(id, owner, cfg) {
    if (id) {
        await DATA.put(id, JSON.stringify(owner), cfg);
        return true;
    }
    else {
        return false;
    }
}

async function delKV(id) {
    if (id) {
        await DATA.delete(id);
        return true;
    }
    else {
        return false;
    }
}

async function listKV(prefix, limit) {
    return await DATA.list({ prefix, limit });
}

async function rateLimit(id) {
    const key = `ratelimit:${id.toLowerCase()}`;
    const currentCount = await getKV(key) || 0;
    const notifyCount = parseInt(currentCount);
    if (notifyCount >= rateLimitMaxRequests) {
        return false;
    }
    await putKV(key, notifyCount + 1, {
        expirationTtl: rateLimitDelay
    });
    return true
}

async function notifyOwner(json) {
    const { id, message } = json;
    const isCanSend = await rateLimit(id);
    if (!isCanSend) {
        return getResponse(JSON.stringify({ code: 200, data: rateLimitMessage, message: "success" }), 200);
    }
    const owner = await getKV(`car_${id.toLowerCase()}`);
    if (!owner) {
        return getResponse(JSON.stringify({ code: 500, data: "车辆信息错误！", message: "fail" }), 200);
    }
    if(!owner.isNotify){
        return getResponse(JSON.stringify({ code: 500, data: "车主未开启该功能,请使用其他方式联系车主!", message: "fail" }), 200); 
    }
    let resp = null;
    const { no, notifyType, notifyToken } = owner;
    const provider = notifyTypeMap.find(element => element.id == notifyType);
    if (provider && provider.functionName && typeof provider.functionName === 'function') {
        const sendMsg = `【${no}】${message || notifyMessage}`;
        resp = await provider.functionName(notifyToken, sendMsg);
    }
    else {
        resp = { code: 500, data: "发送失败!", message: "fail" };
    }
    return getResponse(JSON.stringify(resp), 200);
}

async function callOwner(json) {
    const { id } = json;
    const owner = await getKV(`car_${id.toLowerCase()}`);
    if (!owner) {
        return getResponse(JSON.stringify({ code: 500, data: "车辆信息错误！", message: "fail" }), 200);
    }
    if(!owner.isCall){
        return getResponse(JSON.stringify({ code: 500, data: "车主未开启该功能,请使用其他方式联系车主!", message: "fail" }), 200); 
    }
    const { phone } = owner;
    return getResponse(JSON.stringify({ code: 200, data: phone, message: "success" }), 200);
}

async function addOwner(json) {
    try {
        const { id, no, phone, notifyType, notifyToken, isNotify, isCall } = json;
        await putKV(`car_${id.toLowerCase()}`, { id, no, phone, notifyType, notifyToken, isNotify, isCall });
        return getResponse(JSON.stringify({ code: 200, data: "添加成功", message: "success" }), 200);
    } catch (e) {
        return getResponse(JSON.stringify({ code: 500, data: "添加失败，" + e.message, message: "success" }), 200);
    }
}

async function deleteOwner(json) {
    try {
        const { id } = json;
        await delKV(`car_${id.toLowerCase()}`);
        return getResponse(JSON.stringify({ code: 200, data: "删除成功", message: "success" }), 200);
    } catch (e) {
        return getResponse(JSON.stringify({ code: 500, data: "删除失败，" + e.message, message: "success" }), 200);
    }
}

async function listOwner() {
    const value = await listKV("car_", 50);
    const keys = value.keys;
    const arrys = [];
    for (let i = 0; i < keys.length; i++) {
        const owner = await getKV(keys[i].name);
        if (!owner || !owner?.id) {
            continue;
        }
        arrys.push(owner);
    }
    return getResponse(JSON.stringify({ code: 200, data: arrys, message: "success" }), 200);
}

function getNotifyTypeList() {
    const types = [];
    notifyTypeMap.forEach(element => {
        types.push({ text: element.name, value: element.id, tip: element.tip })
    });

    return getResponse(JSON.stringify({ code: 200, data: types, message: "success" }), 200);
}

function login() {
    const htmlContent = `<!DOCTYPE html>
    <html lang="zh-CN">
    
    <head>
        <meta charset="UTF-8">
        <meta name="viewport"
            content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>通知车主挪车</title>
        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
    
            body {
                font-family: Arial, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: #f0f2f5;
                color: #333;
            }
    
            .container {
                text-align: center;
                padding: 20px;
                width: 100%;
                max-width: 400px;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                background: #fff;
                margin: 10px
            }
    
            h1 {
                font-size: 24px;
                margin-bottom: 20px;
                color: #007bff;
            }
 
            input{
                padding: 5px;
                width: 100%;
            }
    
            button {
                width: 100%;
                padding: 5px;
                margin: 10px 0;
                font-size: 18px;
                font-weight: bold;
                color: #fff;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.3s;
            }
    
            .call-btn {
                background: #17a2b8;
            }
    
            .call-btn:hover {
                background: #138496;
            }
    
            @keyframes float {
                0% {
                    transform: translateY(0px) rotate(0deg);
                }
    
                50% {
                    transform: translateY(-20px) rotate(5deg);
                }
    
                100% {
                    transform: translateY(0px) rotate(0deg);
                }
            }
    
            .loading {
                pointer-events: none;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }
    
            .loading::after {
                content: "";
                position: absolute;
                width: 20px;
                height: 20px;
                border: 3px solid #ffffff;
                border-radius: 50%;
                border-top-color: transparent;
                animation: spin 0.8s linear infinite;
                margin-left: 10px;
            }
    
            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }
    
            .toast {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 50px;
                font-size: 16px;
                opacity: 0;
                transition: opacity 0.3s;
            }
    
            .toast.show {
                opacity: 1;
            }
    
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
            }
        </style>
    </head>
    
    <body>
        <div class="container">
        <h1>登录</h1>
            <input type="text" id="apiKey" placeholder="请输入API_KEY"/>
            <button class="call-btn" onclick="login()">登录</button>
        </div>
        <div id="toast" class="toast"></div>
        <div id="loadingBox" class="modal">
            <div class="loading"></div>
        </div>
    
        <script>
            function login() {
                const authKey = document.getElementById('apiKey').value; 

                if (!authKey) {
                    showToast("请输入API_KEY");
                    return;
                }
    
                showLoading(true);
                fetch("/api/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        apiKey: authKey 
                    })
                })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);                        
                        if(data.code==200){
                            showToast("登录成功！");
                            setTimeout(() => {
                                localStorage.setItem('API_KEY', authKey);
                                window.location.href="/manager";
                            }, 500);                            
                        }
                        else{
                            showToast("登录失败，API_KEY错误！");
                        }
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
            }
    
            function showToast(message, duration = 5000) {
                const toast = document.getElementById('toast');
                toast.textContent = message;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, duration);
            }
    
            // 显示添加模态框
            function showLoading(isShow) {
                if (isShow) {
                    document.getElementById('loadingBox').style.display = 'block';
                }
                else {
                    document.getElementById('loadingBox').style.display = 'none';
                }
            }
        </script>
    </body>
    
    </html>`;

    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    })
}

async function index1(id) {
    const owner = await getKV(`car_${id.toLowerCase()}`);
    const isNotify = owner?.isNotify ?? true;
    const isCall = owner?.isCall ?? true;

    const htmlContent = `<!DOCTYPE html>
    <html lang="zh-CN">
    
    <head>
        <meta charset="UTF-8">
        <meta name="viewport"
            content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>通知车主挪车</title>
        <style>
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
    
            body {
                font-family: Arial, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: #f0f2f5;
                color: #333;
            }
    
            .container {
                text-align: center;
                padding: 20px;
                width: 100%;
                max-width: 400px;
                border-radius: 8px;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                background: #fff;
                margin: 10px
            }
    
            h1 {
                font-size: 24px;
                margin-bottom: 20px;
                color: #007bff;
            }
    
            p {
                margin-bottom: 20px;
                font-size: 16px;
                color: #555;
            }
    
            button {
                width: 100%;
                padding: 15px;
                margin: 10px 0;
                font-size: 18px;
                font-weight: bold;
                color: #fff;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.3s;
            }
    
            .notify-btn {
                background: #28a745;
            }
    
            .notify-btn:hover {
                background: #218838;
            }
    
            .call-btn {
                background: #17a2b8;
            }
    
            .call-btn:hover {
                background: #138496;
            }
    
            .loading {
                pointer-events: none;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }
    
            .loading::after {
                content: "";
                position: absolute;
                width: 20px;
                height: 20px;
                border: 3px solid #ffffff;
                border-radius: 50%;
                border-top-color: transparent;
                animation: spin 0.8s linear infinite;
            }
    
            @keyframes spin {
                0% { transform: translate(-50%, -50%) rotate(0deg); }
                100% { transform: translate(-50%, -50%) rotate(360deg); }
            }
    
            .toast {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 50px;
                font-size: 16px;
                opacity: 0;
                transition: opacity 0.3s;
            }
    
            .toast.show {
                opacity: 1;
            }
    
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
            }

            .hide-notify{
                ${!isNotify ? `display: none;` : ""}
            }
    
            .hide-call{
                ${!isCall ? `display: none;` : ""}
            }
        </style>
    </head>
    
    <body>
        <div class="container">
            <h1>通知车主挪车</h1>
            <p>如需通知车主，请点击以下按钮</p>
            <button class="notify-btn hide-notify" onclick="notifyOwner()">通知车主挪车</button>                    
            <button class="call-btn hide-call" onclick="callOwner()">拨打车主电话</button>
        </div>
        <div id="toast" class="toast"></div>
        <div id="loadingBox" class="modal">
            <div class="loading"></div>
        </div>
    
        <script>
            function getQueryVariable(variable) {
                let query = window.location.search.substring(1);
                let vars = query.split("&");
                for (let i = 0; i < vars.length; i++) {
                    let pair = vars[i].split("=");
                    if (pair[0].toLowerCase() == variable.toLowerCase()) {
                        return pair[1];
                    }
                }
                return "";
            }
    
            // 发送通知
            function notifyOwner() {
                let id = getQueryVariable("id");
    
                if (!id) {
                    showToast("未获取到id参数");
                    return;
                }
    
                showLoading(true);
                fetch("/api/notifyOwner", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: id,
                        message: ""
                    })
                })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);
                        showToast(data.data);
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
            }
    
            // 拨打车主电话
            function callOwner() {
                let id = getQueryVariable("id");
    
                if (!id) {
                    showToast("未获取到id参数");
                    return;
                }
                showLoading(true);
                fetch("/api/callOwner", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: id,
                    })
                })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);
                        if (data.code === 200) {
                            window.location.href = "tel:" + data.data;
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
            }
    
            function showToast(message, duration = 5000) {
                const toast = document.getElementById('toast');
                toast.textContent = message;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, duration);
            }
    
            // 显示添加模态框
            function showLoading(isShow) {
                if (isShow) {
                    document.getElementById('loadingBox').style.display = 'block';
                }
                else {
                    document.getElementById('loadingBox').style.display = 'none';
                }
            }
        </script>
    </body>
    
    </html>`;

    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    })
}

async function index2(id) {
    const owner = await getKV(`car_${id.toLowerCase()}`);
    const isNotify = owner?.isNotify ?? true;
    const isCall = owner?.isCall ?? true;

    const htmlContent = `<!DOCTYPE html>
    <html lang="zh-CN">
    
    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
        content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>通知车主挪车</title>
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
    
        :root {
          --primary-color: #4776E6;
          --secondary-color: #8E54E9;
          --text-color: #2c3e50;
          --shadow-color: rgba(0, 0, 0, 0.1);
        }
    
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
          color: var(--text-color);
          padding: 20px;
          line-height: 1.6;
        }
    
        .container {
          text-align: center;
          padding: 40px 30px;
          width: 100%;
          max-width: 400px;
          border-radius: 16px;
          box-shadow: 0 10px 40px var(--shadow-color);
          background: rgba(255, 255, 255, 0.95);
          /* backdrop-filter: blur(10px); */
          transform: translateY(0);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
    
        .container:hover {
          transform: translateY(-8px);
          box-shadow: 0 15px 50px rgba(0, 0, 0, 0.15);
        }
    
        h1 {
          /* font-size: 32px;  */
          margin-bottom: 25px;
          background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: 700;
        }
    
        .car-icon {
          font-size: 64px;
          margin-bottom: 25px;
          display: inline-block;
          animation: float 6s ease-in-out infinite;
        }
    
        p {
          margin-bottom: 30px;
          /* font-size: 18px;  */
          color: #546e7a;
          line-height: 1.8;
        }
    
        .button-group {
          display: flex;
          flex-wrap: wrap;
          /* 允许子元素换行 */
          justify-content: space-between;
          /* 子元素在主轴上均匀分布 */
          gap: 10px;
          margin-bottom: 20px;
        }
    
        button {
          flex: 1;
          padding: 10px;
          /* font-size: 18px; 
                font-weight: 600;  */
          border-radius: 10px;
          color: #fff;
          border: none;
    
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
    
        button:active {
          transform: scale(0.98);
        }
    
        .action-btn {
          background: linear-gradient(45deg, #546c7c, #546c7c);
          box-shadow: 0 4px 15px rgba(71, 118, 230, 0.2);
        }
    
        .action-btn:hover {
          box-shadow: 0 6px 20px rgba(71, 118, 230, 0.3);
          transform: translateY(-2px);
        }
    
        .notify-btn {
          background: linear-gradient(45deg, var(--primary-color), var(--secondary-color));
          box-shadow: 0 4px 15px rgba(71, 118, 230, 0.2);
        }
    
        .notify-btn:hover {
          box-shadow: 0 6px 20px rgba(71, 118, 230, 0.3);
          transform: translateY(-2px);
        }
    
        .call-btn {
          background: linear-gradient(45deg, #00b09b, #96c93d);
          box-shadow: 0 4px 15px rgba(0, 176, 155, 0.2);
        }
    
        .call-btn:hover {
          box-shadow: 0 6px 20px rgba(0, 176, 155, 0.3);
          transform: translateY(-2px);
        }
    
        @keyframes float {
          0% {
            transform: translateY(0px) rotate(0deg);
          }
    
          50% {
            transform: translateY(-20px) rotate(5deg);
          }
    
          100% {
            transform: translateY(0px) rotate(0deg);
          }
        }
    
        .loading {
          pointer-events: none;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
    
        .loading::after {
          content: "";
          position: absolute;
          width: 20px;
          height: 20px;
          border: 3px solid #ffffff;
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 0.8s linear infinite;
        }
    
        @keyframes spin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
    
        .toast {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 12px 24px;
          border-radius: 50px;
          font-size: 16px;
          opacity: 0;
          transition: opacity 0.3s;
        }
    
        .toast.show {
          opacity: 1;
        }
    
        textarea {
          width: 100%;
          padding: 10px;
          margin-bottom: 20px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
    
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
        }

        .hide-notify{
            ${!isNotify ? `display: none;` : ""}
        }

        .hide-call{
            ${!isCall ? `display: none;` : ""}
        }
      </style>
    </head>
    
    <body>
      <div class="container">
        <div class="car-icon">🚗</div>
        <h1>温馨提示</h1>
        <p>不好意思阻碍到您的出行了<br>请通过以下方式联系我，我会立即前来挪车</p>
        <div class="button-group hide-notify">
            <textarea rows="5" id="notifyMessage" placeholder="给车主留言">车主，有人需要您挪车，请及时处理一下哦。</textarea>
        </div>        
        <div class="button-group hide-notify">
          <button class="action-btn" data-msg="车主，有人需要您挪车，请及时处理一下哦。">
            <span>挪车</span>
          </button>
          <button class="action-btn" data-msg="车主，您爱车的车窗未关，请及时处理一下哦。">
            <span>未关窗</span>
          </button>
        </div>
        <div class="button-group hide-notify">
          <button class="action-btn" data-msg="车主，您爱车的车灯未关，请及时处理一下哦。">
            <span>未关灯</span>
          </button>
          <button class="action-btn" data-msg="车主，此处有交警查车，请及时处理一下哦。">
            <span>交警</span>
          </button>
        </div>
        <div class="button-group">
          <button class="notify-btn hide-notify" onclick="notifyOwner()">
            <span>微信通知</span> 📱
          </button>
          <button class="call-btn hide-call" onclick="callOwner()">
            <span>电话联系</span> 📞
          </button>
        </div>
      </div>
      <div id="toast" class="toast"></div>
      <div id="loadingBox" class="modal">
        <div class="loading"></div>
      </div>
      <script>
    
        document.addEventListener('DOMContentLoaded', () => {
          let btns = document.querySelectorAll(".action-btn");
          btns.forEach(element => {
            element.addEventListener("click", function (e) {
              document.getElementById("notifyMessage").value = e.currentTarget.dataset.msg;
            })
          });
        });
    
        function showToast(message, duration = 5000) {
          const toast = document.getElementById('toast');
          toast.textContent = message;
          toast.classList.add('show');
          setTimeout(() => {
            toast.classList.remove('show');
          }, duration);
        }
    
        // 显示关闭加载框
        function showLoading(isShow) {
          if (isShow) {
            document.getElementById('loadingBox').style.display = 'block';
          }
          else {
            document.getElementById('loadingBox').style.display = 'none';
          }
        }
    
        function getQueryVariable(variable) {
          let query = window.location.search.substring(1);
          let vars = query.split("&");
          for (let i = 0; i < vars.length; i++) {
            let pair = vars[i].split("=");
            if (pair[0].toLowerCase() == variable.toLowerCase()) {
              return pair[1];
            }
          }
          return "";
        }
    
        // 发送通知
        function notifyOwner() {
          let id = getQueryVariable("id");
          let message = document.getElementById("notifyMessage").value || "您好，有人需要您挪车，请及时处理。"
          if (!id) {
            showToast("未获取到id参数");
            return;
          }
          showLoading(true);
          fetch("/api/notifyOwner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: id,
              message: message
            })
          })
            .then(response => response.json())
            .then(data => {
              showLoading(false);
              showToast(data.data);
            })
            .catch(error => {
              showLoading(false);
              console.error("Error sending notification:", error);
              alert("通知发送出错，请检查网络连接。");
            });
        }
    
        // 拨打车主电话
        function callOwner() {
          let id = getQueryVariable("id");
    
          if (!id) {
            showToast("未获取到id参数");
            return;
          }
          showLoading(true);
          fetch("/api/callOwner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: id,
            })
          })
            .then(response => response.json())
            .then(data => {
              showLoading(false);
              if (data.code === 200) {
                window.location.href = "tel:" + data.data;
              } else {
                alert(data.data);
              }
            })
            .catch(error => {
              showLoading(false);
              console.error("Error sending notification:", error);
              alert("通知发送出错，请检查网络连接。");
            });
        }
      </script>
    </body>
    
    </html>`;
    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    })
}

function managerOwnerIndex() {
    const htmlContent = `<!DOCTYPE html>
    <html lang="zh">
    
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>车辆管理系统</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
    
            body {
                font-family: Arial, sans-serif;
                background-color: #f5f5f5;
                padding: 20px;
            }
    
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
    
            .header {
                background-color: #fff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                margin-bottom: 20px;
            }
    
            .header h1 {
                color: #333;
                margin-bottom: 20px;
            }
    
            .add-btn {
                padding: 8px 16px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s;
                margin-bottom: 20px;
            }
    
            .add-btn:hover {
                background-color: #45a049;
            }

            .loginOut-btn {
                padding: 8px 16px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s;
                margin-bottom: 20px;
            }
    
            .loginOut-btn:hover {
                background-color: #c82333;
            }            
    
            .table-container {
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                overflow-x: auto;
            }
    
            table {
                width: 100%;
                border-collapse: collapse;
            }
    
            th,
            td {
                padding: 12px 15px;
                text-align: left;
                border-bottom: 1px solid #ddd;
                white-space:nowrap;                
            }
    
            th {
                background-color: #f8f9fa;
                font-weight: 600;
            }
    
            .actions {
                display: flex;
                gap: 8px;
            }
    
            .delete-btn {
                background-color: #dc3545;
                color: white;
                padding: 5px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s;
            }
    
            .delete-btn:hover {
                background-color: #c82333;
            }
    
            .edit-btn {
                background-color: #ffc107;
                color: white;
                padding: 5px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s;
            }
    
            .edit-btn:hover {
                background-color: #e0a800;
            }

            .notify-btn {
                background-color: #17a2b8;
                color: white;
                padding: 5px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.3s;
            }
    
            .notify-btn:hover {
                background-color: #138496;
            }
    
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                overflow-y: scroll;
            }
    
            .modal-content {
                background-color: #fff;
                margin: auto auto;
                padding: 20px;
                border-radius: 8px;
                width: 80%;
                max-width: 500px;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }
    
            .loading {
                pointer-events: none;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
              }
          
              .loading::after {
                content: "";
                position: absolute;
                width: 20px;
                height: 20px;
                border: 3px solid #ffffff;
                border-radius: 50%;
                border-top-color: transparent;
                animation: spin 0.8s linear infinite;
              }
          
              @keyframes spin {
                  0% { transform: translate(-50%, -50%) rotate(0deg); }
                  100% { transform: translate(-50%, -50%) rotate(360deg); }
              }            
    
            .close {
                float: right;
                cursor: pointer;
                font-size: 24px;
            }
    
            .add-form {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
    
            .input-group {
                display: flex;
                flex-direction: column;
            }
    
            input,
            textarea,
            select {
                padding: 8px 4px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }
    
            h2,
            label {
                margin-bottom: 5px;
            }
            
        </style>
    </head>
    
    <body>
        <div class="container">
            <div class="header">
                <h1>车辆管理系统</h1>
                <button class="add-btn" onclick="getOwnerList()">刷新列表</button>
                <button class="add-btn" onclick="showAddModal()">添加车辆</button>
                <button class="loginOut-btn" onclick="loginOut()">注销登录</button>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>车辆ID</th>
                            <th>车牌号</th>
                            <th>手机号</th>
                            <th>通知方式</th>
                            <th>通知Token</th>
                            <th>消息通知</th>
                            <th>电话通知</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody id="ownerList">
                    </tbody>
                </table>
            </div>
        </div>
        <div id="addModal" class="modal">
            <div class="modal-content">
                <span class="close" onclick="closeAddModal()">&times;</span>
                <h2>车辆信息</h2>
                <form class="add-form" onsubmit="event.preventDefault(); addOwner();">
                    <div class="input-group">
                        <label for="addId">车辆ID</label>
                        <input type="text" id="addId" placeholder="车辆ID，可为任意内容唯一即可">
                    </div>
                    <div class="input-group">
                        <label for="addId">车牌号</label>
                        <input type="text" id="addNo" placeholder="车牌号">
                    </div>
                    <div class="input-group">
                        <label for="addPhone">手机号</label>
                        <input type="text" id="addPhone" placeholder="手机号">
                    </div>
                    <div class="input-group">
                        <label for="addNotifyType">通知方式</label>
                        <select id="addNotifyType"></select>
                    </div>
                    <div class="input-group">
                        <label for="addNotifyToken">通知Token</label>
                        <textarea rows="10" id="addNotifyToken" placeholder="通知Token"></textarea>
                    </div>                   
                    <div>
                        <input type="checkbox" id="addIsNotify" />
                        <label for="addIsNotify">开启消息通知</label>

                        <input type="checkbox" id="addIsCall" />
                        <label for="addIsCall">开启电话通知</label>
                    </div>   
                    <button type="submit" class="add-btn">确定</button>
                </form>
            </div>
        </div>
        <div id="loadingBox" class="modal">
            <div class="loading"></div>
        </div>        
    
        <script>
            function loginOut() {
                if (!confirm('确认退出登录吗？')) {
                    return;
                } 
                localStorage.clear();
                setTimeout(()=>{
                    window.location.href="/login"
                },1000)
            }

            // 显示关闭加载框
            function showLoading(isShow) {
              if (isShow) {
                document.getElementById('loadingBox').style.display = 'block';
              }
              else {
                document.getElementById('loadingBox').style.display = 'none';
              }
            }            
    
            // 获取车辆列表
            function getOwnerList() {
                const authKey = localStorage.getItem('API_KEY') || "";
                if (!authKey) {
                    alert("请输入API_KEY");
                    return;
                }

                showLoading(true);
    
                fetch("/api/listOwner", {
                        method: 'POST',
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + authKey
                        },
                    })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);
                        if (data.code === 200) {
                            displayOwnerList(data.data);
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
            }
    
            // 显示车辆列表
            function displayOwnerList(data) {
                const tbody = document.getElementById('ownerList');
                tbody.innerHTML = '';
                data.forEach(owner => {
                    const tr = document.createElement('tr');
                    tr.innerHTML =\`
                    <td><a href="/?id=\${owner.id}" target="_blank">\${owner.id}</a></td>
                    <td>\${owner.no}</td>
                    <td>\${owner.phone}</td>
                    <td>\${owner.notifyType}</td>
                    <td>\${owner.notifyToken.length>30?owner.notifyToken.substring(0,30)+"...":owner.notifyToken}</td>
                    <td>\${owner.isNotify?"已开启":"未开启"}</td>
                    <td>\${owner.isCall?"已开启":"未开启"}</td>
                    <td class="actions">
                        <button class="notify-btn" onclick="notifyOwner('\${owner.id}')">通知</button>
                        <button class="edit-btn" onclick="showEditModal('\${owner.id}', '\${owner.no}', '\${owner.phone}', '\${owner.notifyType}', '\${owner.notifyToken}', \${owner.isNotify}, \${owner.isCall})">编辑</button>
                        <button class="delete-btn" onclick="deleteOwner('\${owner.id}')">删除</button>
                    </td>\`;
                    tbody.appendChild(tr);
                });
            }

            // 通知车辆
            function notifyOwner(id) {
                showLoading(true);
                fetch("/api/notifyOwner", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            id
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);
                        if (data.code === 200) {
                            alert(data.data);
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
            }

            // 添加车辆
            function addOwner() {
                const id = document.getElementById('addId').value;
                const no = document.getElementById('addNo').value;
                const phone = document.getElementById('addPhone').value;
                const notifyType = document.getElementById('addNotifyType').value;
                const notifyToken = document.getElementById('addNotifyToken').value;
                const isNotify = document.getElementById('addIsNotify').checked;
                const isCall = document.getElementById('addIsCall').checked;
                if (!id || !phone || !notifyType || !notifyToken) {
                    alert('请填写所有字段');
                    return;
                }

                if (!isNotify && !isCall ) {
                    alert('请选择通知方式');
                    return;
                }
    
                const authKey = localStorage.getItem('API_KEY') || "";
                if (!authKey) {
                    alert("请输入API_KEY");
                    return;
                }

                showLoading(true);
    
                fetch("/api/addOwner", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            "Authorization": "Bearer " + authKey
                        },
                        body: JSON.stringify({
                            id,
                            no,
                            phone,
                            notifyType,
                            notifyToken,
                            isNotify,
                            isCall
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);
                        if (data.code === 200) {
                            alert(data.data);
                            closeAddModal();
                            getOwnerList();
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
    
            }
    
            // 删除车辆
            function deleteOwner(id) {
                const authKey = localStorage.getItem('API_KEY') || "";
                if (!authKey) {
                    alert("请输入API_KEY");
                    return;
                }
    
                if (!confirm('确认删除该车辆？')) {
                    return;
                }
    
                showLoading(true);
                fetch("/api/deleteOwner", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            "Authorization": "Bearer " + authKey
                        },
                        body: JSON.stringify({
                            id
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        showLoading(false);
                        if (data.code === 200) {
                            alert(data.data);
                            getOwnerList();
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
                        showLoading(false);
                        console.error("Error sending notification:", error);
                        alert("通知发送出错，请检查网络连接。");
                    });
            }
    
            //获取通知渠道列表
            function notifyTypeList() {
                const notifyType = document.getElementById('addNotifyType');
                fetch("/api/notifyTypeList", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.code == 200) {
                            data.data.forEach(optionData => {
                                const optionElement = document.createElement('option');
                                optionElement.value = optionData.value;
                                optionElement.textContent = optionData.text;
                                optionElement.dataset.tip = optionData.tip; // 存储 tip 值
                                notifyType.appendChild(optionElement);
                            });
    
                            if (notifyType.options.length > 0) {
                                addNotifyToken.placeholder = "请输入通知渠道所需的参数格式如下：" + notifyType.options[0].dataset.tip;
                            }
    
                            // 添加 change 事件监听器
                            notifyType.addEventListener('change', () => {
                                const selectedOption = notifyType.options[notifyType.selectedIndex];
                                addNotifyToken.placeholder = "请输入通知渠道所需的参数格式如下：" + selectedOption.dataset.tip;
                            });
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching options:', error);
                    });
            }
    
            // 显示编辑模态框
            function showEditModal(id, no, phone, notifyType, notifyToken, isNotify, isCall) {
                document.getElementById('addId').value = id;
                document.getElementById('addNo').value = no;
                document.getElementById('addPhone').value = phone;
                document.getElementById('addNotifyType').value = notifyType;
                document.getElementById('addNotifyToken').value = notifyToken;
                document.getElementById('addIsNotify').checked = isNotify;
                document.getElementById('addIsCall').checked = isCall;
                document.getElementById('addModal').style.display = 'block';
            }
    
            // 显示添加模态框
            function showAddModal() {
                document.getElementById('addModal').style.display = 'block';
            }
    
            // 关闭添加模态框
            function closeAddModal() {
                document.getElementById('addModal').style.display = 'none';
                clearAddForm();
            }
    
            // 清空添加表单
            function clearAddForm() {
                document.getElementById('addId').value = '';
                document.getElementById('addNo').value = '';
                document.getElementById('addPhone').value = '';
                //document.getElementById('addNotifyType').value = '';
                document.getElementById('addNotifyToken').value = '';
                document.getElementById('addIsNotify').checked = false;
                document.getElementById('addIsCall').checked = false;
            }
    
            // 页面加载时获取车辆列表
            // window.onload = function() {
            //    getOwnerList();
            // }
    
            document.addEventListener('DOMContentLoaded', () => {
                const apiKey = localStorage.getItem('API_KEY')||"";
                if(!apiKey){
                    window.location.href="/login";
                    return;
                }

                getOwnerList();
                notifyTypeList();
            });
    
            // 点击模态框外部关闭模态框
            // window.onclick = function (event) {
            //     if (event.target == document.getElementById('addModal')) {
            //         closeAddModal();
            //     }
            // }
        </script>
    </body>
    
    </html>`;

    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    })
}

async function wxpusher(token, message) {
    const tokens = token.split('|');
    const reqUrl = 'https://wxpusher.zjiecode.com/api/send/message';
    const jsonBody = {
        appToken: `${tokens[0]}`,
        uids: [`${tokens[1]}`],
        content: `${message}`,
        contentType: 1
    }
    const response = await postRequest(reqUrl, jsonBody);
    const json = await response.json();
    const { code } = json;
    if (code == 1000) {
        return { code: 200, data: sendSuccessMessage, message: "success" };
    }
    else {
        return { code: 500, data: "通知发送失败，请稍后重试。", message: "fail" };
    }
}

async function bark(token, message) {
    const tokens = token.split('|');
    const reqUrl = 'https://api.day.app/push';
    const jsonBody = {
        "body": message,
        "title": "挪车通知",
        "device_key": tokens[0] || "",
        "sound": tokens[1] || "multiwayinvitation",
        "group": "挪车通知",
        "call": "1"
    }

    const response = await postRequest(reqUrl, jsonBody);
    const json = await response.json();
    const { code } = json;
    if (code == 200) {
        return { code: 200, data: sendSuccessMessage, message: "success" }
    }
    else {
        return { code: 500, data: "通知发送失败，请稍后重试。", message: "fail" };
    }
}

async function feishu(token, message) {
    const reqUrl = `https://open.feishu.cn/open-apis/bot/v2/hook/${token}`;
    const jsonBody = {
        "msg_type": "text",
        "content": {
            "text": message
        }
    }
    const response = await postRequest(reqUrl, jsonBody);
    const json = await response.json();
    const { code } = json;
    if (code == 0) {
        return { code: 200, data: sendSuccessMessage, message: "success" };
    }
    else {
        return { code: 500, data: "通知发送失败，请稍后重试。", message: "fail" };
    }
}

async function weixin(token, message) {
    const reqUrl = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${token}`;
    const jsonBody = {
        "msgtype": "text",
        "text": {
            "content": message
        }
    }
    const response = await postRequest(reqUrl, jsonBody);
    const json = await response.json();
    const { errcode } = json;
    if (errcode == 0) {
        return { code: 200, data: sendSuccessMessage, message: "success" };
    }
    else {
        return { code: 500, data: "通知发送失败，请稍后重试。", message: "fail" };
    }
}

async function dingtalk(token, message) {
    const reqUrl = `https://oapi.dingtalk.com/robot/send?access_token=${token}`;
    const jsonBody = {
        "msgtype": "text",
        "text": {
            "content": message
        }
    }
    const response = await postRequest(reqUrl, jsonBody);
    const json = await response.json();
    const { errcode } = json;
    if (errcode == 0) {
        return { code: 200, data: sendSuccessMessage, message: "success" };
    }
    else {
        return { code: 500, data: "通知发送失败，请稍后重试。", message: "fail" };
    }
}

async function onebot(token, message) {
    const tokens = token.split('|');
    const reqUrl = tokens[0];
    const access_token = tokens[1];
    const uid = tokens[2];
    const jsonBody = {
        "message": message
    }

    if (reqUrl.includes("send_private_msg")) {
        jsonBody["user_id"] = uid;
    }
    else {
        jsonBody["group_id"] = uid;
    }

    const headers = { "Authorization": `Bearer ${access_token}` };
    const response = await postRequest(reqUrl, jsonBody, headers);
    const json = await response.json();
    const { retcode } = json;
    if (retcode == 0) {
        return { code: 200, data: sendSuccessMessage, message: "success" };
    }
    else {
        return { code: 500, data: "通知发送失败，请稍后重试。", message: "fail" };
    }
}

function getResponse(resp, status = 200, headers = {}) {
    return new Response(resp, {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            ...headers
        }
    });
}

async function postRequest(reqUrl, jsonBody, headers) {
    const response = await fetch(reqUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(jsonBody)
    });

    if (!response.ok) {
        throw new Error('Unexpected response ' + response.status);
    }
    return response;
}
