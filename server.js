const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const moment = require('moment');
const nodemailer = require('nodemailer');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const MongoClient = require('mongodb').MongoClient;
MongoClient.connect(
	`mongodb+srv://anshm:NcuAQEwPpeA6bgRe@salt-testapp.334w6.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`,
	{ useUnifiedTopology: true }
).then(client => {
	console.log('Connected to Database');

	const db = client.db('SALT-test');
	const usersCollection = db.collection('users');
	const transactionsCollection = db.collection('transactions');

	app.post('/create_user', async (req, res, next) => {
		if (!req.body.email || !req.body.balance) {
			res.status(400).json({ message: 'Parameters missing' });
			return;
		}

		var { email, balance } = req.body;

		await usersCollection.findOne({ email }).then(async resp => {
			if (resp !== undefined) {
				res.status(400).json({ message: 'User already exists!' });
				return;
			}
			var id = Math.random().toFixed(16).split('.')[1];

			const newUser = await usersCollection.insertOne({
				email,
				id,
				balance: Number(balance),
				password: '1234',
			});

			if (!newUser) {
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
				} else console.log(info);
			});

			res.status(201).json({ message: 'User created successfully!' });
		});
	});

	app.post('/verify', async (req, res, next) => {
		if (!req.body.email || !req.body.password) {
			res.status(400).json({ message: 'Parameters missing' });
			return;
		}

		var { email, password } = req.body;

		const user = await usersCollection.findOne({ email });

		if (user === null) {
			res.status(404).json({ message: 'No user found.' });
			return;
		}

		if (password !== user.password) {
			res.status(401).json({ message: 'Incorrect password.' });
			return;
		}

		res.status(201).json({ balance: user.balance, id: user.id, message: 'User verified successfully!' });
	});

	app.post('/transfer', async (req, res, next) => {
		if (!req.body.sender || !req.body.receiver || !req.body.amt) {
			res.status(400).json({ message: 'Parameters missing' });
			return;
		}

		var { sender, receiver, amt } = req.body;

		const from = await usersCollection.findOne({ id: sender });

		if (!from) {
			res.status(404).json({ message: 'Sender not found.' });
			return;
		}

		if (from.balance < amt || from.balance === 0) {
			res.status(401).json({ message: 'Insufficient balance.' });
			return;
		}

		const to = await usersCollection.findOne({ id: receiver });

		if (!to) {
			res.status(404).json({ message: 'Receiver not found.' });
			return;
		}

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
	});

	app.post('/transact', async (req, res, next) => {
		//type, amt (debit=0, credit=1)
		if (!req.body.id || !req.body.type || !req.body.amt) {
			res.status(400).json({ message: 'Parameters missing' });
			return;
		}

		var { id, type, amt } = req.body;

		const account = await usersCollection.findOne({ id });

		if (!account) {
			res.status(404).json({ message: 'Account not found.' });
			return;
		}

		async function debit() {
			if (account.balance < amt || account.balance === 0) {
				res.status(401).json({ message: 'Insufficient balance.' });
				return;
			}
			await usersCollection.findOneAndUpdate({ id }, { $inc: { balance: -Number(amt) } }).then(async () => {
				await transactionsCollection
					.insertOne({
						sender_id: id,
						receiver_id: 100,
						amt: Number(amt),
						timestamp: moment().format(),
					})
					.then(() => res.status(201).json({ message: 'Amount debited!' }));
			});
		}

		async function credit() {
			await usersCollection.findOneAndUpdate({ id }, { $inc: { balance: Number(amt) } }).then(async () => {
				await transactionsCollection
					.insertOne({
						sender_id: 100,
						receiver_id: id,
						amt: Number(amt),
						timestamp: moment().format(),
					})
					.then(() => res.status(201).json({ message: 'Amount credited!' }));
			});
		}

		Number(type) === 1 ? credit() : debit();
	});

	app.get('/getUsers', async (req, res, next) => {
		const cursor = await usersCollection.find().project({ email: 1, id: 1, balance: 1, _id: 0 });
		var usersObj = [];

		cursor
			.forEach(entry => {
				usersObj.push(entry);
			})
			.then(() => res.status(201).json({ users: usersObj }));
	});

	app.get('/getAllTransactions', async (req, res, next) => {
		const cursor = await transactionsCollection.find();
		var transactions = [];

		cursor
			.forEach(entry => {
				transactions.push(entry);
			})
			.then(() => {
				const sortedArray = transactions.sort((a, b) => {
					return moment(a.timestamp).diff(b.timestamp);
				});
				sortedArray.forEach(obj => (obj.timestamp = moment(obj.timestamp).fromNow()));
				res.status(201).json({ transactions });
			});
	});

	app.post('/getTransactionsById', async (req, res, next) => {
		if (!req.body.id) {
			res.status(404).json({ message: 'Parameters missing' });
			return;
		}

		var transactions = [];
		var { id } = req.body;

		const cursor = await transactionsCollection.find({ $or: [{ sender_id: id }, { receiver_id: id }] });

		cursor
			.forEach(entry => {
				transactions.push(entry);
			})
			.then(() => {
				const sortedArray = transactions.sort((a, b) => {
					return moment(a.timestamp).diff(b.timestamp);
				});
				sortedArray.forEach(obj => (obj.timestamp = moment(obj.timestamp).fromNow()));
				res.status(201).json({ sortedArray });
			});
	});

	app.post('/getBal', async (req, res, next) => {
		if (!req.body.id) {
			res.status(401).json({ message: 'Parameters missing' });
			return;
		}
		const data = await usersCollection.findOne({ id: req.body.id });

		if (!data) {
			res.status(404).json({ message: 'No users found' });
			return;
		}

		res.status(201).json({ balance: data.balance });
	});

	app.get('/', async (req, res, next) => {
		res.status(200).json({ message: process.env.TEST_CRED });
	});

	app.listen(port, () => {
		console.log(`Example app listening at http://localhost:${port}`);
	});
});
