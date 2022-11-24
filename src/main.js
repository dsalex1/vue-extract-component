const exampleCode = `<template>
  <newTestComponent />
  <template v-for="fee in membershipFees" :key="fee.id">
    <div
      class="card card-header d-flex justify-content-between cursor-pointer mb-1"
      :class="selectedFees.find((e) => e.id === fee.id) ? 'bg-success' : ''"
      @click="() => toggleFee(fee)"
    >
      <template v-if="selectedFees.find((e) => e.id === fee.id)">✔️</template>
      {{ fee.name }} -
      {{
        fee.price.toLocaleString("de-DE", {
          currency: "EUR",
          style: "currency",
        })
      }}
    </div>
  </template>
  {{
        fee.price.toLocaleString("de-DE", {
          currency: "EUR",
          style: "currency",
        })
      }}
      
      <!-- key modifier using keyAlias -->
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
      <div v-for="(item, index) in items?.items"></div>
      <div v-for="(value, key) in object"></div>
      <div v-for="(value, name, index) in object"></div>
      <div v-for="item in items" :key="item.id">
        {{ item.text! }}
      </div>
      <!-- bind an attribute -->
      <img v-bind:src="imageSrc" />

      <!-- dynamic attribute name -->
      <button v-bind:[key]='value!'></button'>

      <!-- shorthand -->
      <img :src="imageSrc" />
    </div>
    <template v-for="fee in membershipFees" :key="fee.id">
      <div
        class="card card-header d-flex justify-content-between cursor-pointer mb-1"
        :class="selectedFees.find((e) => e.id === fee.id) ? 'bg-success' : ''"
        @click="() => toggleFee(fee)"
      >
        <template v-if="selectedFees.find((e) => e.id === fee.id)">✔️</template>
        {{ fee.name }} -
        {{
          fee.price.toLocaleString("de-DE", {
            currency: "EUR",
            style: "currency",
          })
        }}
      </div>
    </template>
</template>

<script lang="ts" setup>
import newTestComponent from './newTestComponent.vue'
import { useVModel } from "@vueuse/core";
import { toRefs } from "vue";

const props = defineProps<{
  membershipFees: App.Models.MembershipFee[];
  modelValue: App.Models.MembershipFee[];
}>();
const selectedFees = useVModel(props, "modelValue");

const { membershipFees } = toRefs(props);

const toggleFee = (fee: App.Models.MembershipFee) => {
  if (selectedFees.value.find((e) => e.id == fee.id))
    selectedFees.value = selectedFees.value.filter((e) => e.id != fee.id);
  else selectedFees.value.push(fee);
};
</script>
`

//exampleCode
const htmlparser2 = require("htmlparser2");
const { default: traverse } = require('@babel/traverse')
const { parse } = require('@babel/parser');
const lineColumn = require("line-column");
const ts = require("typescript");

/**
 * this function maps a parsed HTML DOM to a more useable json structure
 */
function mapHTMLtoJSON(node) {
  return {
    startIndex: node.startIndex,
    attrs: Object.entries(node.attribs || {}).filter(([key, value]) => key.match(/(?:v-[-\[\]a-zA-Z]+|:|\.|#|@)[^<> \s=&'"]*/)),
    children: node.children
      ?.filter(node => node.type != "script")
      .filter(node => node.children?.length > 0 || node.data?.includes("{{") && node.data?.includes("}}"))
      .map(childNode => mapHTMLtoJSON(childNode)),
    data: [...(node.data?.matchAll(/\{\{(.*?)\}\}/g) || [])].map(s => s[1].trim())
  }
}
/**
 * this function folds the JSON structure into a string of code which can be anylysed to find unbound variables
 */
function foldHTMLJSONToJS(node) {
  let restMapped = ""
  restMapped += [
    ...node.attrs.filter(([name]) => name != "v-for").map(([_, value]) => value),
    ...node.data
  ].map(a => `\n(${a}); //START_INDEX:${node.startIndex}`).join("")
  restMapped += node.children ? node.children.map(child => foldHTMLJSONToJS(child)).join("") : ""

  const vForAttribute = node.attrs.find(([name]) => name == "v-for")
  //TODO: handle v-slot props
  if (vForAttribute) {
    const [_, value, name, index, expression] = vForAttribute[1].match(/\(?(.*?)\s*(?:,\s*(.*?)\s*)?(?:,\s*(.*?)\s*)?\)?\s+in\s+(.*)/)
    return `\n{\n${[value, name, index].filter(s => s).map(s => `let ${s}=[];`).join("\n")}\n(${expression}); //START_INDEX:${node.startIndex}${restMapped}\n}`
  } else {
    return restMapped
  }
}

/**
 * this function analyses code to find unbound variables
 */
function getGlobals(inputCode) {
  const dom = htmlparser2.parseDocument(inputCode, { withStartIndices: true });
  const babelTSCode = foldHTMLJSONToJS(mapHTMLtoJSON(dom));
  const babelCode = ts.transpileModule(babelTSCode, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  console.log(babelTSCode, babelCode)

  const ast = parse(babelCode, { errorRecovery: true });
  const globals = new Map();
  traverse(ast, {
    ReferencedIdentifier: (path) => {
      const name = path.node.name;
      if (path.scope.hasBinding(name, true))
        return;
      if (!globals.has(path.node.name)) {
        const tagStartIndex = babelCode.split("\n")[path.node.loc.start.line - 1].match(/\/\START_INDEX\:(\d*)$/)[1];
        globals.set(path.node.name, lineColumn(inputCode).fromIndex(inputCode.indexOf(path.node.name, tagStartIndex)));
      }
    }
  });
  return [...globals.entries()]
}

console.log(getGlobals(exampleCode));

