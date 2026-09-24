import MapViz from './components/MapViz'
import { DevProvider } from './contexts/DevContext'
import './App.css'

function App() {
  return (
    <div className="App">
      <DevProvider>
        <MapViz />
      </DevProvider>
    </div>
  )
}

export default App
