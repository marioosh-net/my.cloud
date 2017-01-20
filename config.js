module.exports = {
    db: {
        url: 'mongodb://localhost:27017/websafe',
        name: 'websafe'
    },
	basicAuth: {
		username: 'username',
		password: 'password'
	},
    tls: {
    	active: true,
    	key: '/etc/ssl/apache2/server.key',
    	cert: '/etc/ssl/apache2/server.crt',
    	ciphers: 'ECDHE-RSA-AES256-SHA:AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM'
    }
}