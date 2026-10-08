const express = require("express");
const db = require("./config/db");

const app = express();

app.use(express.json());
app.use(express.static("frontend"));

// HOME PAGE

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/frontend/index.html");
});

 // TEST DATABASE

app.get("/test-db", (req, res) => {

    db.query("SELECT 1", (err) => {

        if (err) {
            return res.status(500).send("Database connection failed");
        }

        res.send("Database is working!");
    });

});

// LOGIN

app.post("/login", (req, res) => {

    console.log("LOGIN REQUEST RECEIVED");
    console.log("Email:", req.body.email);
    console.log("Password:", req.body.password);

    const { email, password } = req.body;

    const sql = `
        SELECT *
        FROM USERS
        WHERE Email = ?
        AND Password = ?
    `;

    db.query(sql, [email, password], (err, result) => {

        if (err) {
            console.log("LOGIN DATABASE ERROR:");
            console.log(err);

            return res.status(500).send("Login database error");
        }

        console.log("LOGIN RESULT:");
        console.log(result);

        if (result.length === 0) {

            console.log("NO USER FOUND");

            return res.status(401).send(
                "Invalid email or password"
            );
        }

        console.log("LOGIN SUCCESS");

        res.json(result[0]);
    });

});

// GET RESIDENTS

app.get("/residents", (req, res) => {

    db.query(
        "SELECT * FROM RESIDENT",
        (err, result) => {

            if (err) {
                console.log(err);
                return res.status(500).send("Error loading residents");
            }

            res.json(result);
        }
    );

});

// GET VEHICLES OF RESIDENT

app.get("/vehicles/:residentId", (req, res) => {

    const residentId = req.params.residentId;

    const sql = `
        SELECT *
        FROM VEHICLE
        WHERE Resident_ID = ?
    `;

    db.query(sql, [residentId], (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500).send("Error loading vehicles");
        }

        res.json(result);
    });

});

// GET CHARGERS

app.get("/chargers", (req, res) => {

    db.query(
        "SELECT * FROM CHARGER",
        (err, result) => {

            if (err) {
                console.log(err);
                return res.status(500).send("Error loading chargers");
            }

            res.json(result);
        }
    );

});

// GET BOOKINGS

app.get("/bookings", (req, res) => {

    const sql = `
        SELECT
            BOOKING.Booking_ID,
            BOOKING.Resident_ID,
            RESIDENT.Name AS Resident_Name,
            BOOKING.Vehicle_ID,
            VEHICLE.Vehicle_Number,
            BOOKING.Charger_ID,
            CHARGER.Charger_Type,
            CHARGER.Location,
            BOOKING.Booking_Date,
            BOOKING.Start_Time,
            BOOKING.End_Time,
            BOOKING.Booking_Status
        FROM BOOKING

        JOIN RESIDENT
        ON BOOKING.Resident_ID = RESIDENT.Resident_ID

        JOIN VEHICLE
        ON BOOKING.Vehicle_ID = VEHICLE.Vehicle_ID

        JOIN CHARGER
        ON BOOKING.Charger_ID = CHARGER.Charger_ID

        ORDER BY BOOKING.Booking_Date DESC
    `;

    db.query(sql, (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500).send("Error loading bookings");
        }

        res.json(result);
    });

});

// CREATE BOOKING

app.post("/bookings", (req, res) => {

    const {
        Resident_ID,
        Vehicle_ID,
        Charger_ID,
        Booking_Date,
        Start_Time,
        End_Time
    } = req.body;


    // Check charger

    db.query(
        `
        SELECT Status
        FROM CHARGER
        WHERE Charger_ID = ?
        `,
        [Charger_ID],

        (err, chargerResult) => {

            if (err) {
                console.log(err);
                return res.status(500).send("Booking error");
            }

            if (chargerResult.length === 0) {
                return res.status(400).send("Charger not found");
            }

            if (chargerResult[0].Status !== "Available") {
                return res.status(400).send(
                    "Charger is not available"
                );
            }


            // Check overlapping booking

            const overlapSql = `
                SELECT *
                FROM BOOKING
                WHERE Charger_ID = ?
                AND Booking_Date = ?
                AND Booking_Status = 'Confirmed'

                AND Start_Time < ?
                AND End_Time > ?
            `;

            db.query(
                overlapSql,
                [
                    Charger_ID,
                    Booking_Date,
                    End_Time,
                    Start_Time
                ],

                (err, overlapResult) => {

                    if (err) {
                        console.log(err);
                        return res.status(500)
                            .send("Booking error");
                    }

                    if (overlapResult.length > 0) {
                        return res.status(400).send(
                            "This charger is already booked for this time"
                        );
                    }


                    // Generate booking ID

                    db.query(
                        `
                        SELECT
                        COALESCE(MAX(Booking_ID), 0) + 1
                        AS New_ID
                        FROM BOOKING
                        `,

                        (err, idResult) => {

                            if (err) {
                                console.log(err);
                                return res.status(500)
                                    .send("Booking error");
                            }

                            const bookingId =
                                idResult[0].New_ID;


                            const insertSql = `
                                INSERT INTO BOOKING
                                (
                                    Booking_ID,
                                    Resident_ID,
                                    Vehicle_ID,
                                    Charger_ID,
                                    Booking_Date,
                                    Start_Time,
                                    End_Time,
                                    Booking_Status
                                )

                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `;

                            db.query(
                                insertSql,

                                [
                                    bookingId,
                                    Resident_ID,
                                    Vehicle_ID,
                                    Charger_ID,
                                    Booking_Date,
                                    Start_Time,
                                    End_Time,
                                    "Confirmed"
                                ],

                                (err) => {

                                    if (err) {
                                        console.log(err);
                                        return res.status(500)
                                            .send("Booking failed");
                                    }

                                    res.send(
                                        "Booking created successfully"
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );

});

// GET CHARGING SESSIONS

app.get("/sessions", (req, res) => {

    const sql = `
        SELECT
            CHARGING_SESSION.Session_ID,
            CHARGING_SESSION.Booking_ID,
            BOOKING.Resident_ID,
            RESIDENT.Name AS Resident_Name,
            VEHICLE.Vehicle_Number,
            BOOKING.Charger_ID,
            CHARGING_SESSION.Start_Time,
            CHARGING_SESSION.End_Time,
            CHARGING_SESSION.Energy_Consumed,
            CHARGING_SESSION.Total_Cost

        FROM CHARGING_SESSION

        JOIN BOOKING
        ON CHARGING_SESSION.Booking_ID =
        BOOKING.Booking_ID

        JOIN RESIDENT
        ON BOOKING.Resident_ID =
        RESIDENT.Resident_ID

        JOIN VEHICLE
        ON BOOKING.Vehicle_ID =
        VEHICLE.Vehicle_ID

        ORDER BY CHARGING_SESSION.Session_ID DESC
    `;

    db.query(sql, (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500)
                .send("Error loading sessions");
        }

        res.json(result);
    });

});

// CREATE CHARGING SESSION

app.post("/sessions", (req, res) => {

    const {
        Booking_ID,
        Start_Time,
        End_Time,
        Energy_Consumed
    } = req.body;


    // Calculate cost
    // ₹10 per kWh

    const Total_Cost =
        Number(Energy_Consumed) * 10;


    // Generate session ID

    db.query(
        `
        SELECT
        COALESCE(MAX(Session_ID), 0) + 1
        AS New_ID
        FROM CHARGING_SESSION
        `,

        (err, idResult) => {

            if (err) {
                console.log(err);
                return res.status(500)
                    .send("Session error");
            }

            const sessionId =
                idResult[0].New_ID;


            const sql = `
                INSERT INTO CHARGING_SESSION
                (
                    Session_ID,
                    Booking_ID,
                    Start_Time,
                    End_Time,
                    Energy_Consumed,
                    Total_Cost
                )

                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(
                sql,

                [
                    sessionId,
                    Booking_ID,
                    Start_Time,
                    End_Time,
                    Energy_Consumed,
                    Total_Cost
                ],

                (err) => {

                    if (err) {
                        console.log(err);
                        return res.status(500)
                            .send("Session creation failed");
                    }


                    // Complete booking

                    db.query(
                        `
                        UPDATE BOOKING
                        SET Booking_Status = 'Completed'
                        WHERE Booking_ID = ?
                        `,
                        [Booking_ID]
                    );


                    // Make charger available again

                    db.query(
                        `
                        UPDATE CHARGER
                        SET Status = 'Available'
                        WHERE Charger_ID =
                        (
                            SELECT Charger_ID
                            FROM BOOKING
                            WHERE Booking_ID = ?
                        )
                        `,
                        [Booking_ID]
                    );


                    res.send(
                        "Charging session created successfully"
                    );
                }
            );
        }
    );

});

// GET PAYMENTS

app.get("/payments", (req, res) => {

    const sql = `
        SELECT
            PAYMENT.Payment_ID,
            PAYMENT.Session_ID,
            RESIDENT.Name AS Resident_Name,
            PAYMENT.Payment_Date,
            PAYMENT.Amount,
            PAYMENT.Payment_Mode,
            PAYMENT.Payment_Status

        FROM PAYMENT

        JOIN CHARGING_SESSION
        ON PAYMENT.Session_ID =
        CHARGING_SESSION.Session_ID

        JOIN BOOKING
        ON CHARGING_SESSION.Booking_ID =
        BOOKING.Booking_ID

        JOIN RESIDENT
        ON BOOKING.Resident_ID =
        RESIDENT.Resident_ID

        ORDER BY PAYMENT.Payment_ID DESC
    `;

    db.query(sql, (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500)
                .send("Error loading payments");
        }

        res.json(result);
    });

});

// CREATE PAYMENT

app.post("/payments", (req, res) => {

    const {
        Session_ID,
        Payment_Mode
    } = req.body;


    // Check session

    db.query(
        `
        SELECT Total_Cost
        FROM CHARGING_SESSION
        WHERE Session_ID = ?
        `,
        [Session_ID],

        (err, sessionResult) => {

            if (err) {
                console.log(err);
                return res.status(500)
                    .send("Payment error");
            }

            if (sessionResult.length === 0) {
                return res.status(400)
                    .send("Session not found");
            }

            const amount =
                sessionResult[0].Total_Cost;


            // Check duplicate payment

            db.query(
                `
                SELECT *
                FROM PAYMENT
                WHERE Session_ID = ?
                `,
                [Session_ID],

                (err, paymentResult) => {

                    if (err) {
                        console.log(err);
                        return res.status(500)
                            .send("Payment error");
                    }

                    if (paymentResult.length > 0) {
                        return res.status(400).send(
                            "Payment already recorded"
                        );
                    }


                    // Generate payment ID

                    db.query(
                        `
                        SELECT
                        COALESCE(MAX(Payment_ID), 0) + 1
                        AS New_ID
                        FROM PAYMENT
                        `,

                        (err, idResult) => {

                            if (err) {
                                console.log(err);
                                return res.status(500)
                                    .send("Payment error");
                            }

                            const paymentId =
                                idResult[0].New_ID;


                            const insertSql = `
                                INSERT INTO PAYMENT
                                (
                                    Payment_ID,
                                    Session_ID,
                                    Payment_Date,
                                    Amount,
                                    Payment_Mode,
                                    Payment_Status
                                )

                                VALUES
                                (?, ?, CURDATE(), ?, ?, 'Paid')
                            `;

                            db.query(
                                insertSql,

                                [
                                    paymentId,
                                    Session_ID,
                                    amount,
                                    Payment_Mode
                                ],

                                (err) => {

                                    if (err) {
                                        console.log(err);
                                        return res.status(500)
                                            .send("Payment failed");
                                    }

                                    res.send(
                                        "Payment recorded successfully"
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );

});

// GET MAINTENANCE

app.get("/maintenance", (req, res) => {

    const sql = `
        SELECT
            MAINTENANCE.Maintenance_ID,
            MAINTENANCE.Charger_ID,
            CHARGER.Charger_Type,
            CHARGER.Location,
            MAINTENANCE.Maintenance_Date,
            MAINTENANCE.Description,
            MAINTENANCE.Maintenance_Status

        FROM MAINTENANCE

        JOIN CHARGER
        ON MAINTENANCE.Charger_ID =
        CHARGER.Charger_ID

        ORDER BY MAINTENANCE.Maintenance_ID DESC
    `;

    db.query(sql, (err, result) => {

        if (err) {
            console.log(err);
            return res.status(500)
                .send("Error loading maintenance");
        }

        res.json(result);
    });

});

// CREATE MAINTENANCE

app.post("/maintenance", (req, res) => {

    const {
        Charger_ID,
        Maintenance_Date,
        Description
    } = req.body;


    // Generate maintenance ID

    db.query(
        `
        SELECT
        COALESCE(MAX(Maintenance_ID), 0) + 1
        AS New_ID
        FROM MAINTENANCE
        `,

        (err, idResult) => {

            if (err) {
                console.log(err);
                return res.status(500)
                    .send("Maintenance error");
            }

            const maintenanceId =
                idResult[0].New_ID;


            const sql = `
                INSERT INTO MAINTENANCE
                (
                    Maintenance_ID,
                    Charger_ID,
                    Maintenance_Date,
                    Description,
                    Maintenance_Status
                )

                VALUES (?, ?, ?, ?, 'Pending')
            `;

            db.query(
                sql,

                [
                    maintenanceId,
                    Charger_ID,
                    Maintenance_Date,
                    Description
                ],

                (err) => {

                    if (err) {
                        console.log(err);
                        return res.status(500)
                            .send("Maintenance failed");
                    }


                    // Set charger under maintenance

                    db.query(
                        `
                        UPDATE CHARGER
                        SET Status = 'Under Maintenance'
                        WHERE Charger_ID = ?
                        `,
                        [Charger_ID]
                    );


                    res.send(
                        "Maintenance added successfully"
                    );
                }
            );
        }
    );

});

// COMPLETE MAINTENANCE

app.put("/maintenance/:id", (req, res) => {

    const maintenanceId =
        req.params.id;


    // First find charger

    db.query(
        `
        SELECT Charger_ID
        FROM MAINTENANCE
        WHERE Maintenance_ID = ?
        `,
        [maintenanceId],

        (err, result) => {

            if (err) {
                console.log(err);
                return res.status(500)
                    .send("Maintenance error");
            }

            if (result.length === 0) {
                return res.status(404)
                    .send("Maintenance record not found");
            }

            const chargerId =
                result[0].Charger_ID;


            // Complete maintenance

            db.query(
                `
                UPDATE MAINTENANCE
                SET Maintenance_Status = 'Completed'
                WHERE Maintenance_ID = ?
                `,
                [maintenanceId],

                (err) => {

                    if (err) {
                        console.log(err);
                        return res.status(500)
                            .send("Maintenance update failed");
                    }


                    // Make charger available

                    db.query(
                        `
                        UPDATE CHARGER
                        SET Status = 'Available'
                        WHERE Charger_ID = ?
                        `,
                        [chargerId]
                    );


                    res.send(
                        "Maintenance completed successfully"
                    );
                }
            );
        }
    );

});

// ADMIN REPORTS

app.get("/reports", (req, res) => {

    const reports = {};

    // TOTAL REVENUE

    db.query(
        `
        SELECT
            COALESCE(SUM(Amount), 0)
            AS Total_Revenue

        FROM PAYMENT

        WHERE Payment_Status = 'Paid'
        `,

        (err, revenueResult) => {

            if (err) {
                console.log(err);
                return res.status(500)
                    .send("Report error");
            }

            reports.revenue =
                revenueResult[0].Total_Revenue;

            // TOTAL ENERGY

            db.query(
                `
                SELECT
                    COALESCE(
                        SUM(Energy_Consumed),
                        0
                    )
                    AS Total_Energy

                FROM CHARGING_SESSION
                `,

                (err, energyResult) => {

                    if (err) {
                        console.log(err);
                        return res.status(500)
                            .send("Report error");
                    }

                    reports.energy =
                        energyResult[0].Total_Energy;

                    // BOOKINGS PER RESIDENT

                    db.query(
                        `
                        SELECT
                            RESIDENT.Name,
                            COUNT(
                                BOOKING.Booking_ID
                            )
                            AS Total_Bookings

                        FROM RESIDENT

                        LEFT JOIN BOOKING

                        ON RESIDENT.Resident_ID =
                        BOOKING.Resident_ID

                        GROUP BY
                            RESIDENT.Resident_ID,
                            RESIDENT.Name

                        ORDER BY
                            Total_Bookings DESC
                        `,

                        (err, residentResult) => {

                            if (err) {
                                console.log(err);
                                return res.status(500)
                                    .send("Report error");
                            }

                            reports.residents =
                                residentResult;


                            // CHARGER USAGE

                            db.query(
                                `
                                SELECT
                                    CHARGER.Charger_ID,
                                    CHARGER.Charger_Type,
                                    CHARGER.Location,

                                    COUNT(
                                        BOOKING.Booking_ID
                                    )
                                    AS Total_Bookings

                                FROM CHARGER

                                LEFT JOIN BOOKING

                                ON CHARGER.Charger_ID =
                                BOOKING.Charger_ID

                                GROUP BY
                                    CHARGER.Charger_ID,
                                    CHARGER.Charger_Type,
                                    CHARGER.Location

                                ORDER BY
                                    Total_Bookings DESC
                                `,

                                (err, chargerResult) => {

                                    if (err) {
                                        console.log(err);
                                        return res.status(500)
                                            .send("Report error");
                                    }

                                    reports.chargers =
                                        chargerResult;

                                    res.json(reports);
                                }
                            );
                        }
                    );
                }
            );
        }
    );

});

// START SERVER

app.listen(3000, () => {

    console.log(
        "Server running at http://localhost:3000"
    );

});