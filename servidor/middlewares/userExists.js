const { getDB } = require('../bbdd/db');

const userExists = async (req, res, next) => {
    let connection;
    try {
        connection = await getDB();
        const { typeauth } = req.headers;

        let idUser;

        if (typeauth === 'google' || typeauth === 'fb') {
            idUser = req.userauth.idUser;
        } else if (typeauth === 'API') {
            idUser = req.params.idUser;
        }

        const [user] = await connection.query(
            `SELECT id FROM users WHERE id = ? AND deleted = 0;`,
            [idUser]
        );
        if (user.length < 1) {
            const error = new Error('Usuario no encontrado');
            error.httpStatus = 404;
            throw error;
        }

        /* if(res.headersSent){
            return next(err)
        } */
        return next();
    } catch (error) {
        return next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = { userExists };
