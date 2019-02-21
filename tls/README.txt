openssl genrsa -des3 -out ca.key 1024
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt
openssl rsa -in ca.key -out ca.key
