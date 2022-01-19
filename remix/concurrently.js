const concurrently = require('concurrently');

concurrently([
    {command: 'yarn dev', name: "remix dev"},
    {command: 'yarn arc:sandbox', name: "sandbox"}
], {
    prefix: 'name',
    killOthers: ['failure', 'success'],
    restartTries: 3,
});