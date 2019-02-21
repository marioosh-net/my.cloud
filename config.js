module.exports = {
    db: {
        url: 'mongodb://localhost:27017/websafe'
    },
    crypto: {
        secret: 'bc62dfc3583301792391d115d69bc3c0s'
    },
	basicAuth: {
        active: true,
        credentials: {
    		username: 'username',
    		password: 'password'
        }
	},
    tls: {
    	active: true,
    	key: 'tls/ca.key',
    	cert: 'tls/ca.crt',
    	ciphers: 'ECDHE-RSA-AES256-SHA:AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM'
    }
}
