const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const moment = require('moment');
const nodemailer = require('nodemailer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const usersTable = { TableName: 'users' };
const transactionsTable = { TableName: 'transactions' };

const config = require('./config');
var docClient;

try {
	AWS.config.update(config);
	docClient = new AWS.DynamoDB.DocumentClient();
	console.log('Connected to DynamoDB!');
} catch (err) {
	console.log('Error in starting DB.');
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post('/create_user', async (req, res, next) => {
	if (!req.body.email || !req.body.balance) {
		res.status(400).json({ message: 'Parameters missing' });
		return;
	}

	var { email, balance } = req.body;

	await docClient.get(
		{
			...usersTable,
			Key: { email },
		},
		async (err, data) => {
			if (err) {
				res.status(500).json({ message: 'An error occured.' });
				return;
			}
			if (Object.keys(data).length > 0) {
				res.status(400).json({ message: 'User already exists!' });
				return;
			}

			const newUser = {
				id: Math.random().toFixed(16).split('.')[1],
				email,
				password: '1234',
				balance: Number(balance),
			};

			await docClient.put({ ...usersTable, Item: newUser }, (err, data) => {
				if (err) {
					res.status(500).json({ message: 'An error occured.' });
					return;
				}
				var transporter = nodemailer.createTransport({
					service: 'gmail',
					auth: {
						user: 'asquaremrocks@gmail.com',
						pass: 'rvsuljwlvazzaxnm',
					},
				});

				const mailOptions = {
					from: 'asquaremrocks@gmail.com', // sender address
					to: email, // list of receivers
					subject: 'New user added to MiniBank!', // Subject line
					html: `<h1>Welcome to Mini Bank!</h1><h3>Here are your login credentials:</h3><p>Email: <b>${email}</b></p><p>Password: <b>${'1234'}</b></p><p>Note: This is just for testing purposes.</p>`, // plain text body
				};
				transporter.sendMail(mailOptions, function (err, info) {
					if (err) {
						res.status(500).json({ message: 'An error occured during sending mail.' });
						return;
					}
				});
				res.status(201).json({ message: 'User created successfully!' });
			});
		}
	);
});

app.post('/verify', async (req, res, next) => {
	if (!req.body.email || !req.body.password) {
		res.status(400).json({ message: 'Parameters missing' });
		return;
	}

	var { email, password } = req.body;

	await docClient.get(
		{
			...usersTable,
			Key: { email },
		},
		(err, data) => {
			if (err) {
				res.status(500).json({ message: 'An error occured.' });
				return;
			}
			if (Object.keys(data).length === 0) {
				res.status(404).json({ message: 'No user found.' });
				return;
			}
			const user = data.Item;
			if (password !== user.password) {
				res.status(401).json({ message: 'Incorrect password.' });
				return;
			}
			res.status(200).json({ balance: user.balance, id: user.id, message: 'User verified successfully!' });
		}
	);
});

app.post('/transfer', async (req, res, next) => {
	if (!req.body.sender_email || !req.body.receiver || !req.body.amt) {
		res.status(400).json({ message: 'Parameters missing' });
		return;
	}

	var { sender_email, receiver, amt } = req.body;
	var sender_bal, receiver_bal, sender_id, receiver_id, receiver_email;

	amt = Number(amt);

	await docClient.get({ ...usersTable, Key: { email: sender_email } }, async (err, data) => {
		if (err) {
			res.status(500).json({ message: 'An error occured.' });
			return;
		}
		if (Object.keys(data).length === 0) {
			res.status(404).json({ message: 'Sender not found.' });
			return;
		}

		sender_bal = data.Item.balance;
		sender_id = data.Item.id;

		if (sender_bal < amt || sender_bal === 0) {
			res.status(401).json({ message: 'Insufficient balance.' });
			return;
		}

		await docClient.scan(
			{
				...usersTable,
				FilterExpression: 'id=:r',
				ExpressionAttributeValues: { ':r': receiver },
			},
			async (err, data) => {
				if (err) {
					res.status(500).json({ message: 'An error occured.' });
					return;
				}
				if (Object.keys(data.Items).length === 0) {
					res.status(404).json({ message: 'Receiver not found.' });
					return;
				}

				receiver_bal = data.Items[0].balance;
				receiver_id = data.Items[0].id;
				receiver_email = data.Items[0].email;

				sender_bal -= amt;
				receiver_bal += amt;

				await docClient.update(
					{
						...usersTable,
						Key: { email: sender_email },
						UpdateExpression: 'set balance = :r',
						ExpressionAttributeValues: { ':r': Number(sender_bal) },
					},
					async err => {
						if (err) {
							res.status(500).json({ message: 'An error occured.' });
							return;
						}
						await docClient.update(
							{
								...usersTable,
								Key: { email: receiver_email },
								UpdateExpression: 'set balance=:r',
								ExpressionAttributeValues: { ':r': receiver_bal },
							},
							async err => {
								if (err) {
									console.log(err);
									res.status(500).json({ message: 'An error occured.' });
									return;
								}
								const newTransaction = {
									transaction_id: uuidv4(),
									sender_id,
									receiver_id,
									amt,
									timestamp: moment().format(),
								};
								await docClient.put({ ...transactionsTable, Item: newTransaction }, err => {
									if (err) {
										console.log(err);
										res.status(500).json({ message: 'An error occured.' });
										return;
									}
									res.status(201).json({ message: 'Transferred!' });
								});
							}
						);
					}
				);
			}
		);
	});

	/*

	await usersCollection
		.findOneAndUpdate({ id: sender }, { $inc: { balance: -Number(amt) } })
		.then(async (err, doc) => {
			await usersCollection
				.findOneAndUpdate({ id: receiver }, { $inc: { balance: Number(amt) } })
				.then(async err => {
					await transactionsCollection
						.insertOne({
							sender_id: sender,
							receiver_id: receiver,
							amt: Number(amt),
							timestamp: moment().format(),
						})
						.then(() => {
							res.status(201).json({ message: 'transferred!' });
						});
				});
		});

		*/
});

app.post('/transact', async (req, res, next) => {
	//type, amt (debit=0, credit=1)
	if (!req.body.id || !req.body.type || !req.body.amt) {
		res.status(400).json({ message: 'Parameters missing' });
		return;
	}

	var { id, type, amt } = req.body;
	amt = Number(amt);
	var acc_balance, email;

	await docClient.scan(
		{
			...usersTable,
			FilterExpression: 'id=:r',
			ExpressionAttributeValues: { ':r': id },
		},
		async (err, data) => {
			if (err) {
				res.status(500).json({ message: 'An error occured.' });
				return;
			}
			if (Object.keys(data.Items).length === 0) {
				res.status(404).json({ message: 'User not found.' });
				return;
			}

			acc_balance = data.Items[0].balance;
			email = data.Items[0].email;

			Number(type) === 1 ? credit(acc_balance + amt) : debit(acc_balance - amt);
		}
	);

	async function debit(amount) {
		if (acc_balance < amt || acc_balance === 0) {
			res.status(401).json({ message: 'Insufficient balance.' });
			return;
		}
		await docClient.update(
			{
				...usersTable,
				Key: { email },
				UpdateExpression: 'set balance = :r',
				ExpressionAttributeValues: { ':r': amount },
			},
			async err => {
				if (err) {
					res.status(500).json({ message: 'An error occured.' });
					return;
				}
				const newTransaction = {
					transaction_id: uuidv4(),
					sender_id: id,
					receiver_id: 100,
					amt,
					timestamp: moment().format(),
				};
				await docClient.put({ ...transactionsTable, Item: newTransaction }, err => {
					if (err) {
						console.log(err);
						res.status(500).json({ message: 'An error occured.' });
						return;
					}
					res.status(201).json({ message: 'Amount debited!' });
				});
			}
		);
	}

	async function credit(amount) {
		await docClient.update(
			{
				...usersTable,
				Key: { email },
				UpdateExpression: 'set balance = :r',
				ExpressionAttributeValues: { ':r': amount },
			},
			async err => {
				if (err) {
					res.status(500).json({ message: 'An error occured.' });
					return;
				}
				const newTransaction = {
					transaction_id: uuidv4(),
					sender_id: 100,
					receiver_id: id,
					amt,
					timestamp: moment().format(),
				};
				await docClient.put({ ...transactionsTable, Item: newTransaction }, err => {
					if (err) {
						console.log(err);
						res.status(500).json({ message: 'An error occured.' });
						return;
					}
					res.status(201).json({ message: 'Amount credited!' });
				});
			}
		);
	}
});

app.get('/getUsers', async (req, res, next) => {
	await docClient.scan({ ...usersTable, ProjectionExpression: 'email, balance, id' }, (err, data) => {
		if (err) {
			res.status(500).json({ message: 'An error occured.' });
			return;
		}
		res.status(200).json({ users: data.Items });
	});
});

app.get('/getAllTransactions', async (req, res, next) => {
	var transactions = [];
	await docClient.scan(transactionsTable, (err, data) => {
		if (err) {
			res.status(500).json({ message: 'An error occured.' });
			return;
		}

		data.Items.forEach(entry => transactions.push(entry));

		const sortedArray = transactions.sort((a, b) => {
			return moment(a.timestamp).diff(b.timestamp);
		});
		sortedArray.forEach(obj => (obj.timestamp = moment(obj.timestamp).fromNow()));

		res.status(200).json({ transactions });
	});
});

app.post('/getTransactionsById', async (req, res, next) => {
	if (!req.body.id) {
		res.status(404).json({ message: 'Parameters missing' });
		return;
	}

	var transactions = [];

	await docClient.scan(
		{
			...transactionsTable,
			FilterExpression: 'sender_id=:r OR receiver_id=:r',
			ExpressionAttributeValues: { ':r': req.body.id },
		},
		(err, data) => {
			if (err) {
				res.status(500).json({ message: 'An error occured.' });
				return;
			}
			if (Object.keys(data).length === 0) {
				res.status(200).json({ transactions: [] });
				return;
			}

			data.Items.forEach(entry => transactions.push(entry));

			const sortedArray = transactions.sort((a, b) => {
				return moment(a.timestamp).diff(b.timestamp);
			});
			sortedArray.forEach(obj => (obj.timestamp = moment(obj.timestamp).fromNow()));

			res.status(200).json({ sortedArray });
		}
	);
});

app.post('/getBal', async (req, res, next) => {
	if (!req.body.email) {
		res.status(401).json({ message: 'Parameters missing' });
		return;
	}

	await docClient.get({ ...usersTable, Key: { email: req.body.email } }, (err, data) => {
		if (err) {
			res.status(500).json({ message: 'An error occured.' });
			return;
		}
		if (Object.keys(data).length === 0) {
			res.status(404).json({ message: 'No user found.' });
			return;
		}

		res.status(200).json({ balance: data.Item.balance });
	});
});

app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`);
});
