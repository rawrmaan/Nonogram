import Nonogram from './Nonogram'
import {
  FILLED,
  EMPTY,
  UNSET,
  TEMPORARILY_FILLED,
  TEMPORARILY_EMPTY,
  INCONSTANT,
} from './type'

const sum = array => array.reduce((a, b) => a + b, 0)

export default class Solver extends Nonogram {
  constructor(rowHints, colHints, canvas, config) {
    super()
    Object.assign(this, config)

    this.rowHints = rowHints.slice()
    this.colHints = colHints.slice()
    this.removeNonPositiveHints()
    this.m = rowHints.length
    this.n = colHints.length
    this.grid = new Array(this.m)
    for (let i = 0; i < this.m; i += 1) {
      this.grid[i] = new Array(this.n)
    }
    this.rowHints.forEach((row) => {
      row.isCorrect = false
      row.unchangedSinceLastScanned = false
    })
    this.colHints.forEach((col) => {
      col.isCorrect = false
      col.unchangedSinceLastScanned = false
    })

    this.canvas = canvas instanceof HTMLCanvasElement ? canvas : document.getElementById(canvas)
    if (!this.canvas || this.canvas.hasAttribute('occupied')) {
      return
    }

    this.canvas.width = this.width || this.canvas.clientWidth
    this.canvas.height = this.canvas.width * (this.m + 1) / (this.n + 1)
    this.canvas.nonogram = this
    this.canvas.addEventListener('click', this.click)
    this.canvas.oncontextmenu = (e) => {
      e.preventDefault()
    }

    this.print()
  }

  static get success() { return new Event('success') }
  static get error() { return new Event('error') }
  static get cellValueMap() {
    const t = new Map()
    t.set(TEMPORARILY_FILLED, FILLED)
    t.set(TEMPORARILY_EMPTY, EMPTY)
    t.set(INCONSTANT, UNSET)
    return t
  }
  click(e) {
    if (this.hasAttribute('occupied')) {
      return
    }

    const self = this.nonogram
    const d = this.clientWidth * 2 / 3 / (self.n + 1)
    const x = e.clientX - this.getBoundingClientRect().left
    const y = e.clientY - this.getBoundingClientRect().top
    const location = self.getLocation(x, y)
    if (location === 'grid') {
      if (self.scanner && self.scanner.error) {
        return
      }
      const i = Math.floor(y / d - 0.5)
      const j = Math.floor(x / d - 0.5)
      if (self.grid[i][j] === UNSET) {
        self.grid[i][j] = FILLED
        self.rowHints[i].unchangedSinceLastScanned = false
        self.colHints[j].unchangedSinceLastScanned = false
        self.solve()
      }
    } else if (location === 'controller') {
      self.refresh()
    }
  }
  refresh() {
    if (this.canvas.hasAttribute('occupied')) {
      return
    }

    this.grid = new Array(this.m)
    for (let i = 0; i < this.m; i += 1) {
      this.grid[i] = new Array(this.n)
    }
    this.rowHints.forEach((row) => {
      row.isCorrect = false
      row.unchangedSinceLastScanned = false
    })
    this.colHints.forEach((col) => {
      col.isCorrect = false
      col.unchangedSinceLastScanned = false
    })
    delete this.scanner

    this.solve()
  }
  solve() {
    return new Promise((resolve, reject) => {
      if (this.canvas) {
        if (this.canvas.hasAttribute('occupied')) {
          return
        }
        this.canvas.setAttribute('occupied', '')
      } else {
        this.demoMode = false
      }
      this.description = `Solves a(n) ${this.m}×${this.n} nonogram${this.demoMode ? ' in demo mode' : ''}`
      console.time(this.description)
      this.scan(resolve, reject)
    })
  }
  scan(resolve, reject) {
    this.updateScanner(resolve)
    if (this.scanner === undefined) {
      return
    }

    if (this.demoMode) {
      this.print()
    }
    this.scanner.error = true
    this.solveSingleLine()
    if (this.scanner.error) {
      if (this.canvas) {
        console.timeEnd(this.description)
        this.canvas.removeAttribute('occupied')
        this.print()
        this.canvas.dispatchEvent(Solver.error)
        reject()
      }
      return
    }
    if (this.demoMode) {
      setTimeout(() => {
        this.scan(resolve, reject)
      }, this.delay)
    } else {
      this.scan(resolve, reject)
    }
  }

  updateScanner(resolve) {
    let line
    do {
      if (this.scanner === undefined) {
        this.scanner = {
          direction: 'row',
          i: 0,
        }
      } else {
        this.scanner.error = false
        this.scanner.i += 1
        if (this[`${this.scanner.direction}Hints`][this.scanner.i] === undefined) {
          this.scanner.direction = (this.scanner.direction === 'row') ? 'col' : 'row'
          this.scanner.i = 0
        }
      }
      line = this[`${this.scanner.direction}Hints`][this.scanner.i]

      if (this.rowHints.every(row => row.unchangedSinceLastScanned) &&
        this.colHints.every(col => col.unchangedSinceLastScanned)) {
        delete this.scanner
        if (this.canvas) {
          console.timeEnd(this.description)
          this.canvas.removeAttribute('occupied')
          this.print()
          this.canvas.dispatchEvent(Solver.success)
          resolve()
        }
        return
      }
    }
    while (line.isCorrect || line.unchangedSinceLastScanned)
  }
  solveSingleLine(direction = this.scanner.direction, i = this.scanner.i) {
    this[`${direction}Hints`][i].unchangedSinceLastScanned = true

    this.line = this.getSingleLine(direction, i)
    const finished = this.line.every(cell => cell !== UNSET)
    if (!finished) {
      this.hints = this.getHints(direction, i)
      this.blanks = []
      this.getAllSituations(this.line.length - sum(this.hints) + 1)
      this.setBackToGrid(direction, i)
    }
    if (this.checkCorrectness(direction, i)) {
      this[`${direction}Hints`][i].isCorrect = true
      if (finished) {
        this.scanner.error = false
      }
    }
  }
  getAllSituations(max, array = [], index = 0) {
    if (index === this.hints.length) {
      this.blanks = array.slice(0, this.hints.length)
      this.blanks[0] -= 1
      this.mergeSituation()
    }

    for (let i = 1; i <= max; i += 1) {
      array[index] = i
      this.getAllSituations(max - array[index], array, index + 1)
    }
  }
  mergeSituation() {
    const status = []
    for (let i = 0; i < this.hints.length; i += 1) {
      status.push(...new Array(this.blanks[i]).fill(TEMPORARILY_EMPTY))
      status.push(...new Array(this.hints[i]).fill(TEMPORARILY_FILLED))
    }
    status.push(...new Array(this.line.length - status.length).fill(TEMPORARILY_EMPTY))

    const improper = status.some((cell, i) =>
      (cell === TEMPORARILY_EMPTY && this.line[i] === FILLED) ||
      (cell === TEMPORARILY_FILLED && this.line[i] === EMPTY)
    )
    if (improper) {
      return
    }

    this.scanner.error = false
    status.forEach((cell, i) => {
      if (cell === TEMPORARILY_FILLED) {
        if (this.line[i] === TEMPORARILY_EMPTY) {
          this.line[i] = INCONSTANT
        } else if (this.line[i] === UNSET) {
          this.line[i] = TEMPORARILY_FILLED
        }
      } else if (cell === TEMPORARILY_EMPTY) {
        if (this.line[i] === TEMPORARILY_FILLED) {
          this.line[i] = INCONSTANT
        } else if (this.line[i] === UNSET) {
          this.line[i] = TEMPORARILY_EMPTY
        }
      }
    })
  }
  setBackToGrid(direction, i) {
    if (direction === 'row') {
      this.line.forEach((cell, j) => {
        if (Solver.cellValueMap.has(cell)) {
          if (this.grid[i][j] !== Solver.cellValueMap.get(cell)) {
            this.grid[i][j] = Solver.cellValueMap.get(cell)
            this.colHints[j].unchangedSinceLastScanned = false
          }
        }
      })
    } else if (direction === 'col') {
      this.line.forEach((cell, j) => {
        if (Solver.cellValueMap.has(cell)) {
          if (this.grid[j][i] !== Solver.cellValueMap.get(cell)) {
            this.grid[j][i] = Solver.cellValueMap.get(cell)
            this.rowHints[j].unchangedSinceLastScanned = false
          }
        }
      })
    }
  }

  print() {
    if (this.canvas) {
      this.printGrid()
      this.printHints()
      this.printController()
      this.printScanner()
    }
  }
  printController() {
    const ctx = this.canvas.getContext('2d')
    const w = this.canvas.width
    const h = this.canvas.height
    const controllerSize = Math.min(w, h) / 4
    const filledColor = this.filledColor

    function getCycle() {
      const cycle = document.createElement('canvas')
      const borderWidth = controllerSize / 10
      cycle.width = controllerSize
      cycle.height = controllerSize

      const c = cycle.getContext('2d')
      c.translate(controllerSize / 2, controllerSize / 2)
      c.rotate(Math.PI)
      c.arc(0, 0, controllerSize / 2 - borderWidth / 2, Math.PI / 2, Math.PI / 3.9)
      c.lineWidth = borderWidth
      c.strokeStyle = filledColor
      c.stroke()
      c.beginPath()
      c.moveTo((controllerSize / 2 + borderWidth) * Math.SQRT1_2,
        (controllerSize / 2 + borderWidth) * Math.SQRT1_2)
      c.lineTo((controllerSize / 2 - borderWidth * 2) * Math.SQRT1_2,
        (controllerSize / 2 - borderWidth * 2) * Math.SQRT1_2)
      c.lineTo((controllerSize / 2 - borderWidth * 2) * Math.SQRT1_2,
        (controllerSize / 2 + borderWidth) * Math.SQRT1_2)
      c.closePath()
      c.fillStyle = filledColor
      c.fill()

      return cycle
    }

    ctx.fillStyle = this.backgroundColor
    ctx.fillRect(w * 2 / 3 - 1, h * 2 / 3 - 1, w / 3 + 1, h / 3 + 1)
    if (this.canvas.hasAttribute('occupied')) {
      return
    }

    ctx.save()
    ctx.translate(w * 0.7, h * 0.7)
    ctx.drawImage(getCycle(), 0, 0)
    ctx.restore()
  }
  printScanner() {
    if (this.scanner === undefined) {
      return
    }

    const ctx = this.canvas.getContext('2d')
    const w = this.canvas.width
    const h = this.canvas.height
    const d = w * 2 / 3 / (this.n + 1)

    ctx.save()
    ctx.translate(d / 2, d / 2)
    ctx.fillStyle = this.scanner.error ? this.wrongColor : this.correctColor
    ctx.globalAlpha = 0.5
    if (this.scanner.direction === 'row') {
      ctx.fillRect(0, d * this.scanner.i, w, d)
    } else if (this.scanner.direction === 'col') {
      ctx.fillRect(d * this.scanner.i, 0, d, h)
    }
    ctx.restore()
  }
}
Object.assign(Solver.prototype, {
  correctColor: '#999',
  demoMode: true,
  delay: 50,
})
