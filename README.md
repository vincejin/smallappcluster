smallappcluster
==============

Example on how to achieve zero downtime deployment using Node.js cluster.
Barebone Sails.js application running in multiple processes and listening for restart signal (SIGUSR2) to recycle 
worker processes with newly deployed code.
 

To run:

1. Clone to local
2. At command line: ```npm install```
3. At command line: ```sails lift```
4. Visit from browser: ```http://localhost:1337/chat```
