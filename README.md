# car-qrcode-notify
挪车二维码

在大佬的基础上增加了，部分后台管理功能（需要绑定 KV 数据库），可通过 api 添加，删除，更新、查看车辆列表，部署一次可多辆车辆一起使用，无需重复部署。通知发送、获取手机号都由服务器处理，通知渠道支持 wxpusher、bark、feishu 机器人，如需更多渠道可自行增加。可设置发送通知的速率

【V1.2 更新内容】\
1、增加多个通知渠道现在支持（WxPusher、Bark、飞书机器人、微信机器人、钉钉机器人、NapCatQQ、Lagrange.Onebot）\
2、修复已知问题

# 正文开始

1、复制以下代码部署到 cloudflare workers 即可\
2、在新建的 workers 的设置中绑定 KV 数据库，具体如下图（变量名称必须为 DATA）
![image](https://github.com/user-attachments/assets/b1641ff6-92d4-44bb-8edf-d598f2f188b3)

# API 部分

可通过 http 请求软件，或者去 KV 数据库直接修改，所有请求都为 POST 模式，不可在浏览器中直接访问，请求时需要添加 Authorization: Bearer API_KEY 授权头\

```
添加车辆api
* https://xxxxxx.workers.dev/api/addOwner
{"id":"1","phone":"1234567890","notifyType":"1","notifyToken":"AT_xxxxxx|UID_xxxxxx"}
id：每台车辆唯一标识
phone：手机号
notifyType：通知方式，notifyTypeMap对应即可
notifyToken：通知渠道所使用的token

notifyType为1则使用wxpusher，notifyToken格式为AT_xxxxxx|UID_xxxxxx
notifyType为2则使用bark，notifyToken为bark token
notifyType为3则使用feishu，notifyToken为xxxxxx的值，不需要输入完整链接，https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxx

删除车辆api
* https://xxxxxx.workers.dev/api/deleteOwner
{"id":"1"}

车辆列表api
* https://xxxxxx.workers.dev/api/listOwner
```

# 使用方法

部署完后访问你自己的 workers 即可\
1、https://xxxxxx.workers.dev/add 访问你自己的链接添加车辆\
2、https://xxxxxx.workers.dev/manager 比链接1功能更完善\
3、https://xxxxxx.workers.dev/?id=1 访问你自己的链接发送通知或拨打电话。需要带相应的车辆 id

![1731510826119](https://github.com/user-attachments/assets/eb400783-25f4-49f2-bda7-afba87e0adbd)

![image](https://github.com/user-attachments/assets/c7070a26-83c0-4c29-993f-cc8107488151)

![1731510915932](https://github.com/user-attachments/assets/22def089-bfc9-407e-b083-8c5898fd3b31)
