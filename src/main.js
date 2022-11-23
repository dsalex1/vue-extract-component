
const exampleCode = `<!-- key modifier using keyAlias -->
<input @keyup.enter="onEnter" />

<!-- the click event will be triggered at most once -->
<button v-on:click.once="doThis"></button>

<!-- object syntax -->
<button v-on  =  "{ mousedown: doThis, mouseup: doThat }"></button>
<div v-for = "item  in   items">
  {{ item.text}} }}{{    item.test  }}
</div>
<div v-for = 'item  in   items'>
  {{ item.text }}
</div>
<div v-for="(item, index) in items"></div>
<div v-for="(value, key) in object"></div>
<div v-for="(value, name, index) in object"></div>
<div v-for="item in items" :key="item.id">
  {{ item.text }}
</div>
<!-- bind an attribute -->
<img v-bind:src="imageSrc" />

<!-- dynamic attribute name -->
<button v-bind:[key]='value'></button'>

<!-- shorthand -->
<img :src="imageSrc" />`

const jsMatcher = /(?:v-(?!for)[-\[\]a-zA-Z]|:|\.|#|@)[^<> \s=&'"]*\s*=\s*(?:"(.*?)"|'(.*?)')|v-for*\s*=\s*(?:"[^"]* in \s*([^"]*)"|'[^']* in \s*([^']*)')|\{\{\s*(.*?)\s*\}\}/g

let jsFromCode = [...exampleCode.matchAll(jsMatcher)].map(s => `(${s[1] || s[2] || s[3] || s[4] || s[5]});\n`).join("")

const { default: traverse } = require('@babel/traverse')
const { parse } = require('@babel/parser');

const ast = parse(jsFromCode);

console.log(findGlobals(ast))
function findGlobals(ast) {
    const globals = new Map()
    traverse(ast, {
        ReferencedIdentifier: (path) => {
            const name = path.node.name
            if (path.scope.hasBinding(name, true)) return
            globals.set(path.node.name, path)
        }
    })
    return globals.keys()
}
