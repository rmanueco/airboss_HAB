const Amadeus = require('amadeus');
const { formatDate } = require('../../helpers');
const { getDB } = require('../../bbdd/db');
const { CLIENT_ID, CLIENT_SECRET } = process.env;
const amadeus = new Amadeus({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
});
const { sendMailBooking } = require('../../helpers');

const createOrder = async (req, res, next) => {
    let connection;
    try {
        const { flightObject, travelers, idUser } = req.body;
        const { result } = await amadeus.booking.flightOrders.post(
            JSON.stringify({
                data: {
                    type: 'flight-order',
                    flightOffers: [flightObject],
                    travelers: travelers,
                },
            })
        );

        console.log('Order Result:', result);

        connection = await getDB();

        //Extraigo el objeto data de result
        // que tiene la información que necesito.
        const { data } = result;

        //Insertamos la reserva
        //Guardo los datos que necesito para BD.
        const now = new Date();
        const bookingCode = data.id;
        const createdAt = formatDate(now);

        const finalPrice = data.flightOffers[0].price.total;
        const currency = data.flightOffers[0].price.currency;

        //Me quedo con el array de itinerarios.
        const itineraries = data.flightOffers[0].itineraries;
        const oneWay = itineraries.length === 1 ? true : false;

        const [newBooking] = await connection.query(
            `
                INSERT INTO booking (bookingCode, createdAt, finalPrice, currency, oneWay, idUser)
                VALUES(?, ?, ?, ?, ?, ?);
            `,
            [bookingCode, createdAt, finalPrice, currency, oneWay, idUser]
        );

        //Recupero el nuevo idBooking para pasarlo a passengers y a itinerarios
        const { insertId: idBooking } = newBooking;

        //Inserto pasajeros
        for (const traveler of travelers) {
            // console.log(traveler);
            //Si el pasajero ya existe no lo guarda
            // const [passenger] = await connection.query(
            //     `SELECT name
            //                         FROM passengers
            //                         WHERE documentNumber = ? AND
            //                             documentType = ? AND
            //                             nationality = ?`,
            //     [
            //         traveler.documents[0].number,
            //         traveler.documents[0].documentType,
            //         traveler.documents[0].nationality,
            //     ]
            // );
            //Si no hay registros procedo a guardar

            await connection.query(
                `
                        INSERT INTO passengers (name, lastname, documentNumber, documentType, birthDate, gender, phoneContact, emailContact, nationality, idBooking )
                        VALUES(?, ?, ?, ?, ?, ? ,?, ?,?,?);
                    `,
                [
                    traveler.name.firstName,
                    traveler.name.lastName,
                    traveler.documents[0].number,
                    traveler.documents[0].documentType,
                    traveler.dateOfBirth,
                    traveler.gender,
                    traveler.contact.phones[0].number,
                    traveler.contact.emailAddress,
                    traveler.documents[0].nationality,
                    idBooking,
                ]
            );
            console.log('Pasajero guardado');
        }

        //Insertamos itinerarios

        for (let i = 0; i < itineraries.length; i++) {
            const [newItinerarie] = await connection.query(
                `
                    INSERT INTO itineraries (itineraryId, idBooking)
                    VALUES(?, ?);
                `,
                [i, idBooking]
            );
            //Guardo el idItinerario del bucle.
            const { insertId: idItinerarie } = newItinerarie;

            //Me quedo con el array de segmentos.
            const segments = itineraries[i].segments;
            for (let i = 0; i < segments.length; i++) {
                await connection.query(
                    `
                        INSERT INTO segments (segmentId, origin, destination, departure_datetime, arrival_datetime, carrierCode, duration, idItineraries)
                        VALUES(?, ?, ?, ?, ?, ?, ?, ?);
                    `,
                    [
                        i,
                        segments[i].departure.iataCode,
                        segments[i].arrival.iataCode,
                        segments[i].departure.at,
                        segments[i].arrival.at,
                        segments[i].carrierCode,
                        segments[i].duration,
                        idItinerarie,
                    ]
                );
            }
        }
        //Vamos a generar el envío del mail de confirmación de reserva

        //Obtenemos el correo del usuario
        const [user] = await connection.query(
            `
                SELECT email FROM users WHERE id = ?;
            `,
            [idUser]
        );
        const emailto = user[0].email;
        const emailBody = ` Tu reserva ${bookingCode} ha sido realizada con éxito. Gracias por confiar en airboss. A continuación te mostramos la lista de pasajeros:`;

        await sendMailBooking({
            to: emailto,
            subject: `Reserva confirmada con airboss`,
            body: emailBody,
            passengers: travelers,
        });

        //console.log('todo guay');
        res.send({
            status: 'ok',
            data: result,
        });
    } catch (error) {
        console.log('dentro de error: ', error);
        //console.log(error.result.errors);
        //console.log(error.description.source);
        res.send({
            status: 'error',
            message: error,
        });
    } finally {
        if (connection) connection.release;
    }
};

module.exports = createOrder;
// id reserva
//eJzTd9cPdTI2M7EAAAqHAhI%3D
