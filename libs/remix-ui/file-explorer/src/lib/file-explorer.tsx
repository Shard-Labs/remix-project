import React, { useEffect, useState, useRef } from 'react' // eslint-disable-line
import { TreeView, TreeViewItem } from '@remix-ui/tree-view' // eslint-disable-line
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd' // eslint-disable-line
import * as async from 'async'
import * as Gists from 'gists'
import * as helper from '../../../../../apps/remix-ide/src/lib/helper'
import QueryParams from '../../../../../apps/remix-ide/src/lib/query-params'
import { FileExplorerProps, File } from './types'

import './css/file-explorer.css'

const queryParams = new QueryParams()

function packageFiles (filesProvider, directory, callback) {
  const ret = {}
  filesProvider.resolveDirectory(directory, (error, files) => {
    if (error) callback(error)
    else {
      async.eachSeries(Object.keys(files), (path, cb) => {
        if (filesProvider.isDirectory(path)) {
          cb()
        } else {
          filesProvider.get(path, (error, content) => {
            if (error) return cb(error)
            if (/^\s+$/.test(content) || !content.length) {
              content = '// this line is added to create a gist. Empty file is not allowed.'
            }
            ret[path] = { content }
            cb()
          })
        }
      }, (error) => {
        callback(error, ret)
      })
    }
  })
}

export const FileExplorer = (props: FileExplorerProps) => {
  const { files, name, registry, plugin } = props
  const uploadFile = (target) => {
    // TODO The file explorer is merely a view on the current state of
    // the files module. Please ask the user here if they want to overwrite
    // a file and then just use `files.add`. The file explorer will
    // pick that up via the 'fileAdded' event from the files module.

    [...target.files].forEach((file) => {
      const files = props.files

      function loadFile () {
        const fileReader = new FileReader()

        fileReader.onload = async function (event) {
          if (helper.checkSpecialChars(file.name)) {
            // modalDialogCustom.alert('Special characters are not allowed')
            return
          }
          const success = await files.set(name, event.target.result)

          if (!success) {
            // modalDialogCustom.alert('Failed to create file ' + name)
          } else {
            // self.events.trigger('focus', [name])
          }
        }
        fileReader.readAsText(file)
      }
      const name = files.type + '/' + file.name

      files.exists(name, (error, exist) => {
        if (error) console.log(error)
        if (!exist) {
          loadFile()
        } else {
          // modalDialogCustom.confirm('Confirm overwrite', `The file ${name} already exists! Would you like to overwrite it?`, () => { loadFile() })
        }
      })
    })
  }
  const containerRef = useRef(null)
  const [state, setState] = useState({
    focusElement: [],
    focusPath: null,
    menuItems: [
      {
        action: 'createNewFile',
        title: 'Create New File',
        icon: 'fas fa-plus-circle'
      },
      {
        action: 'publishToGist',
        title: 'Publish all [browser] explorer files to a github gist',
        icon: 'fab fa-github'
      },
      {
        action: 'uploadFile',
        title: 'Add Local file to the Browser Storage Explorer',
        icon: 'far fa-folder-open'
      },
      {
        action: 'updateGist',
        title: 'Update the current [gist] explorer',
        icon: 'fab fa-github'
      }
    ].filter(item => props.menuItems && props.menuItems.find((name) => { return name === item.action })),
    files: [],
    actions: {},
    fileManager: null,
    tokenAccess: null,
    ctrlKey: false,
    newFileName: ''
  })

  useEffect(() => {
    (async () => {
      console.log('registry: ', registry)
      const fileManager = registry.get('filemanager').api
      const config = registry.get('config').api
      const tokenAccess = config.get('settings/gist-access-token').api
      const files = await fetchDirectoryContent(name)
      const actions = {
        updateGist: () => {},
        uploadFile,
        publishToGist
      }

      setState(prevState => {
        return { ...prevState, fileManager, tokenAccess, files, actions }
      })
    })()
  }, [])

  const resolveDirectory = async (folderPath, dir: File[]): Promise<File[]> => {
    dir = await Promise.all(dir.map(async (file) => {
      if (file.path === folderPath) {
        file.child = await fetchDirectoryContent(folderPath)
        return file
      } else if (file.child) {
        file.child = await resolveDirectory(folderPath, file.child)
        return file
      } else {
        return file
      }
    }))

    return dir
  }

  const fetchDirectoryContent = async (folderPath: string): Promise<File[]> => {
    return new Promise((resolve) => {
      files.resolveDirectory(folderPath, (error, fileTree) => {
        if (error) console.error(error)
        const files = normalize(folderPath, fileTree)

        resolve(files)
      })
    })
  }

  const normalize = (path, filesList): File[] => {
    const folders = []
    const files = []
    const prefix = path.split('/')[0]

    Object.keys(filesList).forEach(key => {
      const path = prefix + '/' + key

      if (filesList[key].isDirectory) {
        folders.push({
          path,
          name: extractNameFromKey(path),
          isDirectory: filesList[key].isDirectory
        })
      } else {
        files.push({
          path,
          name: extractNameFromKey(path),
          isDirectory: filesList[key].isDirectory
        })
      }
    })

    return [...folders, ...files]
  }

  const extractNameFromKey = (key) => {
    const keyPath = key.split('/')

    return keyPath[keyPath.length - 1]
  }

  const createNewFile = (parentFolder = 'browser') => {
    // const self = this
    // modalDialogCustom.prompt('Create new file', 'File Name (e.g Untitled.sol)', 'Untitled.sol', (input) => {
    // if (!input) input = 'New file'
    // get filename from state (state.newFileName)
    const fileManager = state.fileManager
    const newFileName = parentFolder + '/' + 'unnamed' + Math.floor(Math.random() * 101)

    helper.createNonClashingName(newFileName, files, async (error, newName) => {
      // if (error) return tooltip('Failed to create file ' + newName + ' ' + error)
      if (error) return
      const createFile = await fileManager.writeFile(newName, '')

      if (!createFile) {
        // tooltip('Failed to create file ' + newName)
      } else {
        if (parentFolder === name) {
          // const updatedFiles = await resolveDirectory(parentFolder, state.files)

          setState(prevState => {
            return {
              ...prevState,
              files: [...prevState.files, {
                path: newFileName,
                name: extractNameFromKey(newFileName),
                isDirectory: false
              }]
            }
          })
        }
        await fileManager.open(newName)
        if (newName.includes('_test.sol')) {
          plugin.events.trigger('newTestFileCreated', [newName])
        }
      }
    })
    // }, null, true)
  }

  const publishToGist = () => {
    // modalDialogCustom.confirm(
    //   'Create a public gist',
    //   'Are you sure you want to publish all your files in browser directory anonymously as a public gist on github.com? Note: this will not include directories.',
    //   () => { this.toGist() }
    toGist()
    // )
  }

  const toGist = (id?: string) => {
    const proccedResult = function (error, data) {
      if (error) {
        // modalDialogCustom.alert('Failed to manage gist: ' + error)
        console.log('Failed to manage gist: ' + error)
      } else {
        if (data.html_url) {
          // modalDialogCustom.confirm('Gist is ready', `The gist is at ${data.html_url}. Would you like to open it in a new window?`, () => {
          // window.open(data.html_url, '_blank')
          // })
        } else {
          // modalDialogCustom.alert(data.message + ' ' + data.documentation_url + ' ' + JSON.stringify(data.errors, null, '\t'))
        }
      }
    }

    /**
       * This function is to get the original content of given gist
       * @params id is the gist id to fetch
       */
    async function getOriginalFiles (id) {
      if (!id) {
        return []
      }

      const url = `https://api.github.com/gists/${id}`
      const res = await fetch(url)
      const data = await res.json()
      return data.files || []
    }

    // If 'id' is not defined, it is not a gist update but a creation so we have to take the files from the browser explorer.
    const folder = id ? 'browser/gists/' + id : 'browser/'
    packageFiles(files, folder, (error, packaged) => {
      if (error) {
        console.log(error)
        // modalDialogCustom.alert('Failed to create gist: ' + error.message)
      } else {
        // check for token
        if (!state.tokenAccess) {
          // modalDialogCustom.alert(
          //   'Remix requires an access token (which includes gists creation permission). Please go to the settings tab to create one.'
          // )
        } else {
          const description = 'Created using remix-ide: Realtime Ethereum Contract Compiler and Runtime. \n Load this file by pasting this gists URL or ID at https://remix.ethereum.org/#version=' +
            queryParams.get().version + '&optimize=' + queryParams.get().optimize + '&runs=' + queryParams.get().runs + '&gist='
          const gists = new Gists({ token: state.tokenAccess })

          if (id) {
            const originalFileList = getOriginalFiles(id)
            // Telling the GIST API to remove files
            const updatedFileList = Object.keys(packaged)
            const allItems = Object.keys(originalFileList)
              .filter(fileName => updatedFileList.indexOf(fileName) === -1)
              .reduce((acc, deleteFileName) => ({
                ...acc,
                [deleteFileName]: null
              }), originalFileList)
            // adding new files
            updatedFileList.forEach((file) => {
              const _items = file.split('/')
              const _fileName = _items[_items.length - 1]
              allItems[_fileName] = packaged[file]
            })

            // tooltip('Saving gist (' + id + ') ...')
            gists.edit({
              description: description,
              public: true,
              files: allItems,
              id: id
            }, (error, result) => {
              proccedResult(error, result)
              if (!error) {
                for (const key in allItems) {
                  if (allItems[key] === null) delete allItems[key]
                }
              }
            })
          } else {
            // id is not existing, need to create a new gist
            // tooltip('Creating a new gist ...')
            gists.create({
              description: description,
              public: true,
              files: packaged
            }, (error, result) => {
              proccedResult(error, result)
            })
          }
        }
      }
    })
  }

  // self._components = {}
  // self._components.registry = localRegistry || globalRegistry
  // self._deps = {
  //   config: self._components.registry.get('config').api,
  //   editor: self._components.registry.get('editor').api,
  //   fileManager: self._components.registry.get('filemanager').api
  // }

  // self._components.registry.put({ api: self, name: `fileexplorer/${self.files.type}` })

  // warn if file changed outside of Remix
  // function remixdDialog () {
  //   return yo`<div>This file has been changed outside of Remix IDE.</div>`
  // }

  // props.files.event.register('fileExternallyChanged', (path, file) => {
  //   if (self._deps.config.get('currentFile') === path && self._deps.editor.currentContent() && self._deps.editor.currentContent() !== file.content) {
  //     if (this.files.isReadOnly(path)) return self._deps.editor.setText(file.content)

  //     modalDialog(path + ' changed', remixdDialog(),
  //       {
  //         label: 'Replace by the new content',
  //         fn: () => {
  //           self._deps.editor.setText(file.content)
  //         }
  //       },
  //       {
  //         label: 'Keep the content displayed in Remix',
  //         fn: () => {}
  //       }
  //     )
  //   }
  // })

  // register to event of the file provider
  // files.event.register('fileRemoved', fileRemoved)
  // files.event.register('fileRenamed', fileRenamed)
  // files.event.register('fileRenamedError', fileRenamedError)
  // files.event.register('fileAdded', fileAdded)
  // files.event.register('folderAdded', folderAdded)

  // function fileRenamedError (error) {
  //   modalDialogCustom.alert(error)
  // }

  // const fileAdded = (filepath) => {
  //   const folderpath = filepath.split('/').slice(0, -1).join('/')
  // const currentTree = self.treeView.nodeAt(folderpath)
  // if (!self.treeView.isExpanded(folderpath)) self.treeView.expand(folderpath)
  // if (currentTree) {
  //   props.files.resolveDirectory(folderpath, (error, fileTree) => {
  //     if (error) console.error(error)
  //     if (!fileTree) return
  //     fileTree = normalize(folderpath, fileTree)
  //     self.treeView.updateNodeFromJSON(folderpath, fileTree, true)
  //     self.focusElement = self.treeView.labelAt(self.focusPath)
  //     // TODO: here we update the selected file (it applicable)
  //     // cause we are refreshing the interface of the whole directory when there's a new file.
  //     if (self.focusElement && !self.focusElement.classList.contains('bg-secondary')) {
  //       self.focusElement.classList.add('bg-secondary')
  //     }
  //   })
  // }
  // }

  const label = (data) => {
    return (
      <div className='remixui_items'>
        <span
          title={data.path}
          className={'remixui_label ' + (data.isDirectory ? 'folder' : 'remixui_leaf')}
          data-path={data.path}
          // onkeydown=${editModeOff}
          // onblur=${editModeOff}
        >
          { data.path.split('/').pop() }
        </span>
      </div>
    )
  }

  const onDragEnd = result => {

  }

  const handleClickFile = (path) => {
    state.fileManager.open(path)
    setState(prevState => {
      return { ...prevState, focusElement: [path] }
    })
    containerRef.current.focus()
  }

  const handleClickFolder = async (path) => {
    if (state.ctrlKey) {
      if (state.focusElement.findIndex(item => item === path) !== -1) {
        setState(prevState => {
          return { ...prevState, focusElement: [...prevState.focusElement.filter(item => item !== path)] }
        })
      } else {
        setState(prevState => {
          return { ...prevState, focusElement: [...prevState.focusElement, path] }
        })
      }
    } else {
      const files = await resolveDirectory(path, state.files)

      setState(prevState => {
        return { ...prevState, focusElement: [path], files }
      })
    }
  }

  const renderMenuItems = () => {
    let items
    if (state.menuItems) {
      items = state.menuItems.map(({ action, title, icon }, index) => {
        if (action === 'uploadFile') {
          return (
            <label
              id={action}
              data-id={'fileExplorerUploadFile' + action }
              className={icon + ' mb-0 remixui_newFile'}
              title={title}
              key={index}
            >
              <input id="fileUpload" data-id="fileExplorerFileUpload" type="file" onChange={({ stopPropagation, target }) => {
                stopPropagation()
                uploadFile(target)
              }}
              multiple />
            </label>
          )
        } else {
          return (
            <span
              id={action}
              data-id={'fileExplorerNewFile' + action}
              onClick={(e) => {
                e.stopPropagation()
                action === 'createNewFile' ? createNewFile() : state.actions[action]()
              }}
              className={'newFile ' + icon + ' remixui_newFile'}
              title={title}
              key={index}
            >
            </span>
          )
        }
      })
    }
    return (
      <>
        <span className='remixui_label' title={name} data-path={name} style={{ fontWeight: 'bold' }}>{ name }</span>
        <span className="remixui_menu">{items}</span>
      </>
    )
  }

  const renderFiles = (file, index) => {
    if (file.isDirectory) {
      return (
        <Droppable droppableId={file.path} key={index}>
          {(provided) => (
            <TreeViewItem
              { ...provided.droppableProps }
              innerRef={ provided.innerRef }
              id={`treeViewItem${file.path}`}
              iconX='pr-3 far fa-folder'
              iconY='pr-3 far fa-folder-open'
              key={`${file.path + index}`}
              label={label(file)}
              onClick={(e) => {
                e.stopPropagation()
                handleClickFolder(file.path)
              }}
              labelClass={ state.focusElement.findIndex(item => item === file.path) !== -1 ? 'bg-secondary' : '' }
              controlBehaviour={ state.ctrlKey }
            >
              {
                file.child ? <TreeView id={`treeView${file.path}`} key={index}>{
                  file.child.map((file, index) => {
                    return renderFiles(file, index)
                  })
                }
                </TreeView> : <TreeView id={`treeView${file.path}`} key={index} />
              }
              { provided.placeholder }
            </TreeViewItem>
          )}
        </Droppable>
      )
    } else {
      return (
        <Draggable draggableId={file.path} index={index} key={index}>
          {(provided) => (
            <TreeViewItem
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              innerRef={provided.innerRef}
              id={`treeViewItem${file.path}`}
              key={index}
              label={label(file)}
              onClick={(e) => {
                e.stopPropagation()
                handleClickFile(file.path)
              }}
              icon='fa fa-file'
              labelClass={ state.focusElement.findIndex(item => item === file.path) !== -1 ? 'bg-secondary' : '' }
            />
          )}
        </Draggable>
      )
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.shiftKey) {
          setState(prevState => {
            return { ...prevState, ctrlKey: true }
          })
        }
      }}
      onKeyUp={() => {
        setState(prevState => {
          return { ...prevState, ctrlKey: false }
        })
      }}
    >
      <TreeView id='treeView'>
        <TreeViewItem id="treeViewItem" label={renderMenuItems()} expand={true}>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId='droppableTreeView'>
              {(provided) => (
                <div
                  { ...provided.droppableProps }
                  ref={ provided.innerRef }>
                  <TreeView id='treeViewMenu'>
                    {
                      state.files.map((file, index) => {
                        return renderFiles(file, index)
                      })
                    }
                  </TreeView>
                  { provided.placeholder }
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </TreeViewItem>
      </TreeView>
    </div>
  )
}

export default FileExplorer