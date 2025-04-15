import { useState } from 'react'
import './App.css'

function AppTest() {
  const [count, setCount] = useState(0)

  return (
    <div className="app-container">
      <h1>Teste de Renderização React</h1>
      <p>Se você está vendo esta mensagem, o React está funcionando corretamente!</p>
      <div>
        <button onClick={() => setCount(count + 1)}>
          Contador: {count}
        </button>
      </div>
    </div>
  )
}

export default AppTest
