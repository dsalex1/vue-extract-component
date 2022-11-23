<template>
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
