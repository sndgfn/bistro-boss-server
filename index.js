const express = require('express');
var jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

//middlewears
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ch1t3pv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const menuCollection = client.db("bistroDb").collection("menu")
        const usersCollection = client.db("bistroDb").collection("users")
        const reviewCollection = client.db("bistroDb").collection("reviews")
        const cartsCollection = client.db("bistroDb").collection("carts")
        const paymentCollection = client.db("bistroDb").collection("payments")

        //middlewears
        const verifyToken = (req, res, next) => {
            const token = req.headers.authorization?.split(" ")[1];
            if (!token) {
                return res.sendStatus(401); // Unauthorized
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.sendStatus(403); // Forbidden
                }

                req.decoded = decoded;
                next();
            });
        };
        //verify admin after verify user
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ messege: 'forbidden access' })
            }
            next();
        }

        //menu related api
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result)
        });

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.findOne(query)
            res.send(result)
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result);
        })

        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params._id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc)
            res.send(result)

        })
        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/review', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        })

        // jwt start

        app.post('/jwt', (req, res) => {
            const user = req.body;

            if (!user || !user.email) {
                return res.status(400).send({ error: "User email is required" });
            }

            // Sign the JWT with expiration
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            res.send({ token });
        });
        //jwt end
        //users related api
        app.post('/users', async (req, res) => {
            const user = req.body;
            //insert email is user doesnot exist
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ messege: 'user lready exist' });
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            // console.log(req.headers);
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        // amdin verification
        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ messege: 'forbidden' })
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === "admin";
            }
            res.send({ admin });
        })

        //patch
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result)
        })
        //carts collection
        app.post("/carts", async (req, res) => {
            const cartItem = req.body;
            const result = await cartsCollection.insertOne(cartItem);
            res.send(result);
        });

        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartsCollection.find(query).toArray();
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) }
            const result = await cartsCollection.deleteOne(query);
            res.send(result);
        })
        //payment intant
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: price * 100, // convert to cents
                currency: 'usd',
            });
            res.send({ clientSecret: paymentIntent.client_secret });
        })

        //payment related api
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })


        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            console.log('payment info', payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            };

            const deleteResult = await cartsCollection.deleteMany(query);

            res.send({ paymentResult, deleteResult });
        })

        //stats or analytics
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await usersCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue

            })
        })
        //using aggreate pipeline for chart
        app.get('/order-stats', async (req, res) => {
            const result = await paymentCollection.aggregate([
                {
                    $unwind: '$menuItemIds'// menuItemsIds er elements gula re vag kore 
                },
                {
                    $lookup: { //onno data collection er sathe connect kore
                        from: 'menu',
                        localField: 'menuItemIds',
                        foreignField: '_id',
                        as: 'menuItems'
                    }
                },
                {
                    $unwind: '$menuItems'
                },
                {
                    $group: {
                        _id: '$menuItems.category',
                        quantity: { $sum: 1},
                        revenue:{$sum:'$menuItems.price'}
                        
                           
                    }

                }


            ]).toArray();
            res.send(result)
        })



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("boss is sitting")
})

app.listen(port, () => {
    console.log(`boss server is running on port ${port}`)
})

