const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;

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

	app.post('/verify', async (req, res, next) => {
		if (!req.body.email || !req.body.password) {
			res.status(500).json({ message: 'Parameters missing' });
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

		res.status(201).json({ balance: user.balance, id: user._id, message: 'User verified successfully!' });
	});

	app.listen(port, () => {
		console.log(`Example app listening at http://localhost:${port}`);
	});
});
