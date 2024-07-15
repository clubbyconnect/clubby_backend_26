const { Server } = require("socket.io");
const Chat = require("../models/chat.js");

function initializeChatSocket(server) {

  const io = new Server(server);
  const userSocketMap = {};

  
  
  io.on("connection", (socket) => {


    console.log("Hellow..........Hellow..........");


  });
}

module.exports = initializeChatSocket;



// const { roomId, userId } = socket.handshake.query;

// socket.join(roomId);
// if (userId) userSocketMap[userId] = socket;
// ////----------------send mmsg-----------------------
// socket.on("send-msg", async (data) => {



//   const members = [
//     {
//       sender: data.from,
//       recivers: receiverIds.map((receiverId) => ({
//         reciverId: receiverId,
//         // isRead: isArchivedForMessage.includes(receiverId) ? true : false,
//       })),
//     },
//   ];

//   const message = new Message({
//     message: { text: encryptedMessage },
//     member: members,
//     sender: data.from,
//     sessionId: data.sessionId,
//     roomId: roomId,
//     groupName: data.groupName,
//     isArchived: isArchived
//   });

//   const result = await message.save();

// });

// ////----------------recive mmsg---------------------
// socket.on("receive-message", async (data) => {
//   const receiverIds = data?.to?.split(',');
//   const allMessage = await Message.find({
//     sessionId: data.sessionId,
//     $or: [
//       {
//         'member.sender': data.from,
//         'member.recivers.reciverId': { $in: receiverIds },
//       },
//       {
//         'member.sender': { $in: receiverIds },
//         'member.recivers.reciverId': data.from,
//       },
//     ],
//   }).sort({ updatedAt: 1 });

//   const projectedMessages = allMessage.map((msg) => {
//     return {
//       fromself: msg.sender,
//       message: decryptMessage(msg.message.text),
//       groupName: msg.groupName,
//       time: msg.createdAt
//     }
//   });
//   io.in(roomId).emit('received-messages', projectedMessages); 
// });

// //////------------------read mmsg-------------------marks messages as read for a specific user
// socket.on("getTrueMessage", async (data) => {

// const userId = data.userId;
// const senderId = data.senderId;
// const roomId = data.roomId;
// // console.log("🚀 ~ socket.on ~ roomId:", roomId)
// try {
//   let query = {
//     'member.recivers.reciverId': userId,
//     'member.recivers.isRead': false,
//     'sender': senderId,
//   };

//   if (roomId) {
//     query.roomId = roomId;
//   }

//   const unreadMessages = await Message.find(query);

//   // console.log('unreadMessages-->>', unreadMessages);


//   for (const message of unreadMessages) {
//     // console.log('message--->>', message);
//     message.member.forEach((receiver) => {
//       // console.log('receiver-->>', receiver);
//       receiver.recivers.forEach((item) => {
//         if (item.reciverId === userId) {
//           item.isRead = true;
//         }
//       });
//     });
//     try {
//       await message.save();
//     } catch (error) {
//       console.error('Error saving message:', error);
//     }
//   }

//   console.log('unreadMessages-->>', unreadMessages)

// } catch (error) {
//   console.error('Error marking messages as read:', error);
// }
// });

// //////----------------fetches unread mmsg--------------------------fetches all unread messages for a specific user
// socket.on("getUnreadMessage", async (data) => {

// const userId = data.userId
// try {
//   // const unreadCounts = await Message.find({
//   //   'member.recivers.reciverId': userId,
//   //   'member.recivers.isRead': false,
//   // });

//   const unreadCounts = await Message.find({
//     'member.recivers': {
//       $elemMatch: {
//         reciverId: userId,
//         isRead: false
//       }
//     }
//   });


//   const filteredUnread = unreadCounts.filter(message =>
//     message.member.some(member =>
//       member.recivers.some(receiver =>
//         receiver.reciverId === userId && receiver.isRead === false
//       )
//     )
//   );

//   const unreadCountsObject = {
//     unreadCounts,
//     count: filteredUnread.length
//   }
//   // console.log('test --->>>',unreadCountsObject);

//   io.to(roomId).emit('setUnreadMessage', unreadCountsObject)
// } catch (error) {
//   console.error("Error fetching unread counts:", error);
//   res.status(500).json({ error: "Internal Server Error" });
// }
// });

// /////------------------------alert------------------fetches all unread alerts for a specific user
// socket.on("getAlertMessage", async (data) => {
//   try {
//     const message = await Alert.find({ gameMasterId: data.userId, isRead: "false" });
//     io.to(roomId).emit('setAlertMessage', message)

//   } catch (error) {
//     console.log(error);
//   }
// });

// //////-----------------------notification------------sends a notification to a specific user
// socket.on("sendNotification", async (data) => {
//   const userSocket = userSocketMap[userId];
//   if (userSocket) {
//     userSocket.emit('receiveNotification', notificationData);
//   } else {
//     console.log(`User with ID ${userId} is not connected`);
//   }
//   userSocket.emit('receiveNotification', notificationData);
// });

//  ///----dissconnect----------------
// socket.on("disconnect", async (data) => {
//   socket.leave(roomId);
// });