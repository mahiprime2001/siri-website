<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LoadingScreen from './components/LoadingScreen.vue'

const booting = ref(true)

onMounted(() => {
  // Minimum splash time so the animation reads, then fade out
  setTimeout(() => {
    booting.value = false
  }, 1600)
})
</script>

<template>
  <div class="relative min-h-full">
    <div class="aurora" aria-hidden="true"></div>
    <Transition name="fade">
      <LoadingScreen v-if="booting" />
    </Transition>
    <router-view v-slot="{ Component }">
      <Transition name="fade" mode="out-in">
        <component :is="Component" />
      </Transition>
    </router-view>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
