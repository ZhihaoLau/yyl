import React from 'react'

class App extends React.Component {
  render () {
    return (
      <div>
        <h1>Hello, React</h1>
        <img src={require('./logo.png')} />
      </div>
    )
  }
}

export default App 
