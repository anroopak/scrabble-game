"use strict";
const logger = require('../utils/logger.js')();
const GameRoom = require('../models/game-room.js');
const PostScrabbleErrors = require('../models/errors.js');
const GameLogic = require('./game-logic.js');
const RoomEvents = require('./room-events.js');

let gameRooms = {};

function setEvents(io) {
	io.on('connection', function(socket) {

		socket.broadcast.emit('gameRoomList', {
			rooms: Object.keys(gameRooms)
		});


		socket.on('login', data => {
			// TODO: Perform checking User. 
			socket.handshake.session.user = {
				id: data.user.name, // TODO: Change ID
				name: data.user.name
			};
			socket.emit('login', {
				status: true
			});
		});
		socket.on('control', data => {
			try {
				let gameRoom = null;
				switch (data.control) {
					case 'createRoom':
						if (gameRooms.hasOwnProperty(data.name)) {
							throw PostScrabbleErrors.RoomAlreadyExist();
						}
						gameRoom = new GameRoom({
							owner: data.name,
							name: data.name,
							members: [socket.handshake.session.user]
						});
						gameRoom.joinRoom(socket.handshake.session.user);
						gameRooms[gameRoom.name] = gameRoom;
						socket.handshake.session.gameRoom = gameRoom;
						socket.join(gameRoom.name);
						socket.emit('control', {
							control: 'createRoom',
							roomName: gameRoom.name,
							status: true
						});
						logger.debug("Game Room " + gameRoom.name + " created by " + socket.handshake.session.user.name);
						socket.broadcast.emit('gameRoomList', {
							rooms: Object.keys(gameRooms)
						});
						break;
					case 'joinRoom':
						let gameRoomName = data.name;
						if (!gameRooms.hasOwnProperty(gameRoomName)) {
							throw PostScrabbleErrors.RoomDoesntExist();
						}
						gameRoom = gameRooms[gameRoomName];
						gameRoom.joinRoom(socket.handshake.session.user);
						socket.join(gameRoom.name);
						socket.emit('control', {
							control: 'joinRoom',
							status: true,
							owner: gameRoom.owner
						});
						io.sockets.to(gameRoom.name).emit('game', {
							operation: 'playerJoined',
							status: true,
							members: gameRoom.members,
							newMember: socket.handshake.session.user
						});
						logger.debug(socket.handshake.session.user.name + " JOINED " + gameRoom.name);
						break;
					case 'startGame':
						gameRoom = socket.handshake.session.gameRoom;
						if (!gameRoom) {
							throw PostScrabbleErrors.RoomDoesntExist();
						}
						let tilesForUsers = gameRoom.startGame(socket.handshake.session.user);
						//  Publish to all Gamers in the Room. 
						logger.debug({
							tiles: tilesForUsers
						});
						io.sockets.to(gameRoom.name).emit('game', {
							operation: 'startGame',
							status: true,
							tiles: tilesForUsers,
							startUser: gameRoom.currentUser
						});
						break;
					default:
						throw PostScrabbleErrors.ControlDoesNotExist();
				}
			} catch (e) {
				logger.error({
					data: data
				}, e.message);
				console.log(e.stack);
				socket.emit('control', {
					control: data.control,
					status: false,
					message: e.message
				});
			}

		});
		socket.on('game', data => {
			try {
				console.log(data);
				switch (data.operation) {
					case 'placeWord':
						GameLogic.placeWord(socket, data);
						break;
				}
			} catch (e) {
				logger.error({
					data: data
				}, e.message);
				console.log(e.stack);
				socket.emit('game', {
					operation: data.operation,
					status: false,
					message: e.message
				});
			}
		});
	});
}

module.exports = setEvents;