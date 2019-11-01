const Swarm = require('.')

const topic = process.argv[2]
const name = process.argv[3]

const swarm = Swarm()
swarm.join(topic)

swarm.on('connection', (stream, details) => {
  stream.on('data', data => console.log(data.toString()))
  stream.write(`hello i'm ${name}`)
})
