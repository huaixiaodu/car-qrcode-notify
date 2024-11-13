//Version:1.1.0
//Date:2024-11-13 16:10:05

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

//防止被滥用，在添加车辆信息时需要用来鉴权
const API_KEY = "sk-1234567890";
const notifyMessage = "您好，有人需要您挪车，请及时处理。";
const sendSuccessMessage = "您好，我已收到你的挪车通知，我正在赶来的路上，请稍等片刻！";
//300秒内可发送5次通知
const rateLimitDelay = 300;
const rateLimitMaxRequests = 5;
//达到速率限制时返回内容
const rateLimitMessage = "我正在赶来的路上,请稍等片刻~~~";

//通知类型，其他的通知类型可自行实现
const notifyTypeMap = [
    { "id": "1", "name": "WxPusher", "functionName": wxpusher, "tip": "AT_xxxxxx|UID_xxxxxx" },
    { "id": "2", "name": "Bark", "functionName": bark, "tip": "https://api.day.app/xxxxxx，请直接输入末尾xxxxxx代表的值" },
    { "id": "3", "name": "飞书机器人", "functionName": feishu, "tip": "https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx，请直接输入末尾xxxxxx代表的值" },
    { "id": "4", "name": "企业微信机器人", "functionName": weixin, "tip": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxx，请直接输入末尾xxxxxx代表的值" },
    { "id": "5", "name": "钉钉机器人", "functionName": dingtalk, "tip": "https://oapi.dingtalk.com/robot/send?access_token=xxxxxx，请直接输入末尾xxxxxx代表的值" },
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
                const { id } = await request.json();
                if (await rateLimit(id)) {
                    return await notifyOwner(id);
                }
                else {
                    return getResponse(JSON.stringify({ code: 200, data: rateLimitMessage, message: "success" }), 200);
                }
            }
            else if (pathname == '/api/callOwner') {
                const { id } = await request.json();
                return await callOwner(id);
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
        }
        else if (request.method == "GET") {
            if (pathname == "/manager") {
                return managerOwnerIndex();
            }
            else if (pathname == "/add") {
                return addOwnerIndex();
            }
            else {
                return index();
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

async function rateLimit(id) {
    const key = `ratelimit:${id.toLowerCase()}`;
    const currentCount = await DATA.get(key) || 0;
    const notifyCount = parseInt(currentCount);
    if (notifyCount >= rateLimitMaxRequests) {
        return false;
    }
    await DATA.put(key, notifyCount + 1, {
        expirationTtl: rateLimitDelay
    });
    return true
}

async function notifyOwner(id) {
    const owner = await DATA.get(`car_${id.toLowerCase()}`);
    if (!owner) {
        return getResponse(JSON.stringify({ code: 500, data: "车辆信息错误！", message: "fail" }), 200);
    }
    let resp = null;
    const { notifyType, notifyToken } = JSON.parse(owner);
    const provider = notifyTypeMap.find(element => element.id == notifyType);
    if (provider && provider.functionName && typeof provider.functionName === 'function') {
        resp = await provider.functionName(notifyToken, notifyMessage);
    }
    else {
        resp = { code: 500, data: "发送失败!", message: "fail" };
    }
    return getResponse(JSON.stringify(resp), 200);
}

async function callOwner(id) {
    const owner = await DATA.get(`car_${id.toLowerCase()}`);
    if (!owner) {
        return getResponse(JSON.stringify({ code: 500, data: "车辆信息错误！", message: "fail" }), 200);
    }
    const { phone } = JSON.parse(owner);
    return getResponse(JSON.stringify({ code: 200, data: phone, message: "success" }), 200);
}

async function addOwner(json) {
    const { id, phone, notifyType, notifyToken } = json;
    await DATA.put(`car_${id.toLowerCase()}`, JSON.stringify({ id: id, phone: phone, notifyType: notifyType, notifyToken: notifyToken }));
    return getResponse(JSON.stringify({ code: 200, data: "添加成功", message: "success" }), 200);
}

async function deleteOwner(json) {
    try {
        const { id } = json;
        await DATA.delete(`car_${id}`);
        return getResponse(JSON.stringify({ code: 200, data: "删除成功", message: "success" }), 200);
    } catch (e) {
        return getResponse(JSON.stringify({ code: 500, data: "删除失败，" + e.message, message: "success" }), 200);
    }
}

async function listOwner() {
    const value = await DATA.list({ limit: 50, prefix: "car_" });
    const keys = value.keys;
    const arrys = [];
    for (let i = 0; i < keys.length; i++) {
        arrys.push(JSON.parse(await DATA.get(keys[i].name)));
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

function index() {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>通知车主挪车</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f2f5; color: #333; }
          .container { text-align: center; padding: 20px; width: 100%; max-width: 400px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); background: #fff; }
          h1 { font-size: 24px; margin-bottom: 20px; color: #007bff; }
          p { margin-bottom: 20px; font-size: 16px; color: #555; }
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
          .notify-btn { background: #28a745; }
          .notify-btn:hover { background: #218838; }
          .call-btn { background: #17a2b8; }
          .call-btn:hover { background: #138496; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>通知车主挪车</h1>
          <p>如需通知车主，请点击以下按钮</p>
          <button class="notify-btn" onclick="notifyOwner()">通知车主挪车</button>
          <button class="call-btn" onclick="callOwner()">拨打车主电话</button>
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
  
          // 调用 Wxpusher API 来发送挪车通知
          function notifyOwner() {
            let id=getQueryVariable("id");
  
            if(!id){
                alert("未获取到id参数"); 
                return;
            }
  
            fetch("/api/notifyOwner", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: id,
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.code === 200) {
                alert(data.data);
              } else {
                alert(data.data);
              }
            })
            .catch(error => {
              console.error("Error sending notification:", error);
              alert("通知发送出错，请检查网络连接。");
            });
          }
  
          // 拨打车主电话
          function callOwner() {
            let id=getQueryVariable("id");
  
            if(!id){
                alert("未获取到id参数"); 
                return;
            }          
            fetch("/api/callOwner", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: id,
                })
              })
              .then(response => response.json())
              .then(data => {
                if (data.code === 200) {
                  window.location.href = "tel:"+data.data;
                } else {
                  alert(data.data);
                }
              })
              .catch(error => {
                console.error("Error sending notification:", error);
                alert("通知发送出错，请检查网络连接。");
              });            
          }
        </script>
      </body>
    </html>
  `
    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    })
}

function addOwnerIndex() {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>通知车主挪车</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f0f2f5; color: #333; }
          .container { text-align: center; padding: 20px; width: 100%; max-width: 400px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); background: #fff; }
          h1 { font-size: 24px; margin-bottom: 20px; color: #007bff; }
          p { margin-bottom: 20px; font-size: 16px; color: #555; }
          input[type="text"],select,textarea{ width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 4px; }
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
          .notify-btn { background: #28a745; }
          .notify-btn:hover { background: #218838; }
          .call-btn { background: #17a2b8; }
          .call-btn:hover { background: #138496; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>添加车辆信息</h1>
          <input type="text" id="carId" placeholder="请输入车辆Id" />
          <input type="text" id="phone" placeholder="请输入手机号" />
          <select id="notifyType"></select>
          <textarea rows=20 id="notifyToken" placeholder="请输入通知渠道所需的参数"></textarea>
          <input type="text" id="authKey" placeholder="请输入API_KEY" />
          <button class="call-btn" onclick="addOwner()">添加车辆</button>
          <button class="call-btn" onclick="deleteOwner()">删除车辆</button>
        </div>
  
        <script>
            document.addEventListener('DOMContentLoaded', () => {
              const notifyType = document.getElementById('notifyType');        
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
                          notifyToken.placeholder ="请输入通知渠道所需的参数格式如下："+ notifyType.options[0].dataset.tip;
                      }                    
  
                      // 添加 change 事件监听器
                      notifyType.addEventListener('change', () => {
                          const selectedOption = notifyType.options[notifyType.selectedIndex];
                          notifyToken.placeholder ="请输入通知渠道所需的参数格式如下："+ selectedOption.dataset.tip;
                      });                    
                  }
              })
              .catch(error => {
                  console.error('Error fetching options:', error);
              });
          });
          
          // 添加车辆
          function addOwner() {        
              const carId = document.getElementById('carId').value.trim();
              const phone = document.getElementById('phone').value.trim();
              const notifyType = document.getElementById('notifyType').value.trim();
              const notifyToken = document.getElementById('notifyToken').value.trim();        
              const authKey = document.getElementById('authKey').value.trim();        
              if (!carId || !phone || !notifyType || !notifyToken || !authKey) {
                  alert('参数不完整');
                  return;
              }        
              fetch("/api/addOwner", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      "Authorization": "Bearer " + authKey
                  },
                  body: JSON.stringify({
                      id: carId,
                      phone: phone,
                      notifyType: notifyType,
                      notifyToken: notifyToken
                  })
              })
              .then(response => response.json())
              .then(data => {
                  if (data.code === 200) {
                      alert(data.data);
                  } else {
                      alert(data.data);
                  }
              })
              .catch(error => {
                  console.error("Error sending notification:", error);
                  alert("通知发送出错，请检查网络连接。");
              });
          } 
          
          // 删除车辆
          function deleteOwner() {        
              const carId = document.getElementById('carId').value.trim();   
              const authKey = document.getElementById('authKey').value.trim();        
              if (!carId || !authKey) {
                  alert('车辆Id或API_KEY为空！');
                  return;
              }        
              fetch("/api/deleteOwner", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      "Authorization": "Bearer " + authKey
                  },
                  body: JSON.stringify({
                      id: carId
                  })
              })
              .then(response => response.json())
              .then(data => {
                  if (data.code === 200) {
                      alert(data.data);
                  } else {
                      alert(data.data);
                  }
              })
              .catch(error => {
                  console.error("Error sending notification:", error);
                  alert("通知发送出错，请检查网络连接。");
              });
          }          
        </script>
      </body>
    </html>
  `
    return new Response(htmlContent, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    })
}

function managerOwnerIndex(){
    const htmlContent=`<!DOCTYPE html>
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
    
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
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
                <button class="add-btn" onclick="saveApiKey()">保存API_KEY</button>
                <input type="text" id="authKey" placeholder="请输入API_KEY">
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>车辆ID</th>
                            <th>手机号</th>
                            <th>通知方式</th>
                            <th>通知Token</th>
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
                        <label for="addPhone">手机号</label>
                        <input type="text" id="addPhone" placeholder="手机号">
                    </div>
                    <div class="input-group">
                        <label for="addNotifyType">通知方式</label>
                        <select id="addNotifyType"></select>
                    </div>
                    <div class="input-group">
                        <label for="addNotifyToken">通知Token</label>
                        <textarea rows="20" id="addNotifyToken" placeholder="通知Token"></textarea>
                    </div>
                    <button type="submit" class="add-btn">确定</button>
                </form>
            </div>
        </div>
    
        <script>
            function saveApiKey() {
                const authKey = document.getElementById('authKey').value;
                if (!authKey) {
                    alert("请输入API_KEY");
                    return;
                }
                localStorage.setItem('API_KEY', authKey);
                alert("API_KEY已保存，请刷新页面！")
            }
    
            // 获取车辆列表
            function getOwnerList() {
                const authKey = localStorage.getItem('API_KEY') || "";
                if (!authKey) {
                    alert("请输入API_KEY");
                    return;
                }
    
                fetch("/api/listOwner", {
                        method: 'POST',
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + authKey
                        },
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.code === 200) {
                            displayOwnerList(data.data);
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
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
                    <td>\${owner.id}</td>
                    <td>\${owner.phone}</td>
                    <td>\${owner.notifyType}</td>
                    <td>\${owner.notifyToken}</td>
                    <td class="actions">
                        <button class="edit-btn" onclick="showEditModal('\${owner.id}', '\${owner.phone}', '\${owner.notifyType}', '\${owner.notifyToken}')">编辑</button>
                        <button class="delete-btn" onclick="deleteOwner('\${owner.id}')">删除</button>
                    </td>\`;
                    tbody.appendChild(tr);
                });
            }
    
            // 添加车辆
            function addOwner() {
                const id = document.getElementById('addId').value;
                const phone = document.getElementById('addPhone').value;
                const notifyType = document.getElementById('addNotifyType').value;
                const notifyToken = document.getElementById('addNotifyToken').value;
                if (!id || !phone || !notifyType || !notifyToken) {
                    alert('请填写所有字段');
                    return;
                }
    
                const authKey = localStorage.getItem('API_KEY') || "";
                if (!authKey) {
                    alert("请输入API_KEY");
                    return;
                }
    
                fetch("/api/addOwner", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            "Authorization": "Bearer " + authKey
                        },
                        body: JSON.stringify({
                            id,
                            phone,
                            notifyType,
                            notifyToken
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.code === 200) {
                            alert(data.data);
                            closeAddModal();
                            getOwnerList();
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
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
                        if (data.code === 200) {
                            alert(data.data);
                            getOwnerList();
                        } else {
                            alert(data.data);
                        }
                    })
                    .catch(error => {
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
            function showEditModal(id, phone, notifyType, notifyToken) {
                document.getElementById('addId').value = id;
                document.getElementById('addPhone').value = phone;
                document.getElementById('addNotifyType').value = notifyType;
                document.getElementById('addNotifyToken').value = notifyToken;
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
                document.getElementById('addPhone').value = '';
                //document.getElementById('addNotifyType').value = '';
                document.getElementById('addNotifyToken').value = '';
            }
    
            // 页面加载时获取车辆列表
            // window.onload = function() {
            //    getOwnerList();
            // }
    
            document.addEventListener('DOMContentLoaded', () => {
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
    const reqUrl = 'https://api.day.app/push';
    const jsonBody = {
        "body": message,
        "title": "挪车通知",
        "device_key": token,
        "group": "挪车通知"
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

function getResponse(resp, status) {
    return new Response(resp, {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*'
        }
    });
}

async function postRequest(reqUrl, jsonBody, headers) {
    const response = await fetch(reqUrl, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonBody)
    });

    if (!response.ok) {
        throw new Error('Unexpected response ' + response.status);
    }
    return response;
}
