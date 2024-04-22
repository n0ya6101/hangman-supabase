
    //og-submit

    const express = require('express');
    const app = express();
    const multer = require('multer');
    const path = require('path');
    const bodyParser = require('body-parser');
    const { Client } = require('pg');
    const bcrypt = require('bcrypt'); // Import bcrypt for password hashing
    const fs = require('fs');

    const port = 8000;

    // Serve static files
    app.use(express.static(path.join(__dirname, 'hangman')));
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(express.json());
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

    // Serve the main HTML file
    app.get("/", (req, res) => {
        res.sendFile(path.join(__dirname, "hangman", "index.html"));
    });

    // Start the server
    app.listen(port, () => {
        console.log('Example app listening on port 8000');
    });

    // Set up PostgreSQL connection
    const client = new Client({
        user: "postgres",
        password: "Hangman.io",
        host: "localhost",
        port: 5432,
        database: "hangman"
    });

    client.connect()
        .then(() => console.log('Database connected'))
        .catch(err => console.error('Connection error', err));

    // Function to hash a password
    async function hashPassword(password) {
        try {
            const saltRounds = 10; // Number of salt rounds
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            return hashedPassword;
        } catch (error) {
            console.error('Error hashing password:', error);
            throw new Error('Error hashing password');
        }
    }

    // Function to compare a password with its hash
    async function comparePassword(password, hashedPassword) {
        try {
            const match = await bcrypt.compare(password, hashedPassword);
            return match;
        } catch (error) {
            console.error('Error comparing password:', error);
            throw new Error('Error comparing password');
        }
    }

    // Route to handle form submission
    app.post("/", async (req, res) => {
        console.log("Received form data:", req.body);
        const { username, password } = req.body;

        // Hash the password before storing it
        const hashedPassword = await hashPassword(password);

        console.log("username:", username, "hashed password:", hashedPassword);

        // Check if username already exists
        const checkQuery = 'SELECT * FROM player WHERE username = $1';
        client.query(checkQuery, [username], (err, result) => {
            if (err) {
                console.error('Error checking username:', err);
                res.status(500).send('Internal Server Error');
            } else {
                if (result.rows.length > 0) {
                    // Username already exists, send alert to client
                    console.log('Username already exists:', username);
                    res.status(400).send('Username already exists');
                } else {
                    // Username doesn't exist, proceed with inserting new record
                    const insertQuery = 'INSERT INTO player (username, password) VALUES ($1, $2)';
                    client.query(insertQuery, [username, hashedPassword], (err, result) => {
                        if (err) {
                            console.error('Error inserting data:', err);
                            res.status(500).send('Internal Server Error');
                        } else {
                            console.log('Data inserted successfully:', result.rows);
                            res.status(200).send('Signup successful');
                        }
                    });
                }
            }
        });
    });

    // Handle login
    app.post("/login", async (req, res) => {
        const { username, password } = req.body;

        try {
            // Query the database to check if the user exists
            const query = 'SELECT * FROM player WHERE username = $1';
            const result = await client.query(query, [username]);

            if (result.rows.length === 0) {
                // User not found
                return res.status(401).json({ error: "Invalid username or password" });
            }

            // Compare the hashed password
            const userData = result.rows[0];
            const match = await comparePassword(password, userData.password);

            if (match) {
                // Login successful
                console.log('Login successful for:', username);
                res.status(200).json({
                    success: true,
                    username: userData.username,
                    win: userData.win,
                    loss: userData.loss,
                    avatarPath: userData.avatar_path
                });
            } else {
                // Incorrect password
                console.log('Incorrect password for:', username);
                res.status(401).json({ error: "Invalid username or password" });
            }
        } catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });


    app.post("/updatestat", async (req, res) => {
        const { username, outcome } = req.body;
        console.log(req.body);

        try {
            // Check if the user exists
            const query = 'SELECT * FROM player WHERE username = $1';
            const result = await client.query(query, [username]);

            if (result.rows.length === 0) {
                // User not found
                return res.status(404).json({ error: "User not found" });
            }

            const userData = result.rows[0];
            

            // Increment wins or losses based on the result
            if (outcome === 1) {
                await client.query('UPDATE player SET win = win + 1 WHERE username = $1', [username]);
                console.log("win");
            } else if (outcome === 0) {
                await client.query('UPDATE player SET loss = loss + 1 WHERE username = $1', [username]);
                console.log("lossn");
            }

            // Send success response
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('Error updating stats:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });


    app.post("/getprofile", async (req, res) => {
        const { username } = req.body;

        try {
            // Query the database to check if the user exists and the password matches
            const query = 'SELECT * FROM player WHERE username = $1';
            const result = await client.query(query, [username]);

            if (result.rows.length === 0) {
                // User not found 
                return res.status(401).json({ error: "User not found" });
            }

            const userData = result.rows[0];
            console.log(userData.username,userData.win,userData.loss);
            res.status(200).json({  success: true ,
                                    username: userData.username,
                                    win: userData.win,
                                    loss: userData.loss,
                                    avatarPath: userData.avatar_path
                                });
        } catch (error) {
            console.error('Error fetching stats:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });



    // Set up Multer for file uploads
    const storage = multer.diskStorage({
        destination: function(req, file, cb) {
            cb(null, 'hangman/uploads/');
        },
        filename: function(req, file, cb) {
            cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
        }
    });

    const upload = multer({ storage: storage });




    app.post('/uploadavatar', upload.single('avatar'), async (req, res) => {
        const { username } = req.body;
        const currentAvatarQuery = 'SELECT avatar_path FROM player WHERE username = $1';
        let currentAvatarPath;

        try {
            const result = await client.query(currentAvatarQuery, [username]);
            if (result.rows.length > 0) {
                currentAvatarPath = result.rows[0].avatar_path;
            }
        } catch (error) {
            console.error('Error retrieving current avatar path:', error);
            return res.status(500).send('Internal Server Error');
        }

        if (currentAvatarPath) {
            const currentAvatarFullPath = path.join(__dirname, 'hangman', currentAvatarPath.substring(1)); // Remove leading slash
            console.log(currentAvatarFullPath);
            fs.unlink(currentAvatarFullPath, (err) => {
                if (err) {
                    console.error('Error deleting current avatar:', err);
                    // Handle error as needed
                } else {
                    console.log('Current avatar deleted successfully');
                }
            });
        }

        const relativePath = `/uploads/${req.file.filename}`;
        const updateQuery = 'UPDATE player SET avatar_path = $1 WHERE username = $2';

        try {
            await client.query(updateQuery, [relativePath, username]);
            res.status(200).json({ success: true, avatarPath: relativePath });
        } catch (error) {
            console.error('Error updating avatar path:', error);
            res.status(500).send('Internal Server Error');
        }
    });