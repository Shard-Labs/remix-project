import Web3 from 'web3'
import { PluginClient } from "@remixproject/plugin";
import { createClient } from "@remixproject/plugin-webview";
import remixDebug, { TransactionDebugger as Debugger } from '@remix-project/remix-debug'

export class DebuggerClientApi extends PluginClient {
  el
  offsetToLineColumnConverter
  debugHash
  removeHighlights
  debugHashRequest
  web3Provider
  _web3

  constructor () {
    super()
    createClient(this)
    this.el = null
    this.debugHash = null
    this.removeHighlights = false
    this.debugHashRequest = 0

    const self = this
    this.web3Provider = {
      sendAsync(payload, callback) {
        self.call('web3Provider' as any, 'sendAsync', payload)
          .then(result => callback(null, result))
          .catch(e => callback(e))
      }
    }
    this._web3 = new Web3(this.web3Provider)

    this.offsetToLineColumnConverter = {
      async offsetToLineColumn (rawLocation, file, sources, asts) {
        return await self.call('offsetToLineColumnConverter' as any, 'offsetToLineColumn', rawLocation, file, sources, asts)
      }
    }
  }

  web3 () {
    return this._web3
  }

  async discardHighlight () {
    await this.call('editor', 'discardHighlight')
  }

  async highlight (lineColumnPos, path) {
    const hexColor = ''
    await this.call('editor', 'highlight', lineColumnPos, path, hexColor)
  }

  async getFile (path) {
    await this.call('fileManager', 'getFile', path)
  }

  async setFile (path, content) {
    await this.call('fileManager', 'setFile', path, content)
  }

  deactivate () {
    this.removeHighlights = true
  }

  debug (hash) {
    this.debugHash = hash
    this.debugHashRequest++ // so we can trigger a debug using the same hash 2 times in a row. that's needs to be improved
  }

  onBreakpointCleared (listener) {
    this.on('editor', 'breakpointCleared' as any, listener)
  }

  onBreakpointAdded (listener) {
    this.on('editor', 'breakpointAdded' as any, listener)
  }

  onEditorContentChanged (listener) {
    this.on('editor', 'contentChanged' as any, listener)    
  }

  async getDebugWeb3 () {
    let web3
    let network
    try {
      network = await this.call('network', 'detectNetwork')    
    } catch (e) {
      web3 = this.web3()
    }
    if (!web3) {
      const webDebugNode = remixDebug.init.web3DebugNode(network.name)
      web3 = !webDebugNode ? this.web3() : webDebugNode
    }
    remixDebug.init.extendWeb3(web3)
    return web3
  }

  async getTrace (hash) {
    if (!hash) return
    const web3 = await this.getDebugWeb3()
    const currentReceipt = await web3.eth.getTransactionReceipt(hash)
    const debug = new Debugger({
      web3,
      offsetToLineColumnConverter: this.offsetToLineColumnConverter,
      compilationResult: async (address) => {
        try {
          return await this.fetchContractAndCompile(address, currentReceipt)
        } catch (e) {
          console.error(e)
        }
        return null
      },
      debugWithGeneratedSources: false
    })
    return await debug.debugger.traceManager.getTrace(hash)
  }

  async fetchContractAndCompile (address, receipt) {
    const target = (address && remixDebug.traceHelper.isContractCreation(address)) ? receipt.contractAddress : address
    const targetAddress = target || receipt.contractAddress || receipt.to
    return await this.call('fetchAndCompile' as any, 'resolve', targetAddress, 'browser/.debug', this.web3())
  } 
}
