<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { animate } from 'animejs'

const logo = ref<HTMLElement | null>(null)
const ring1 = ref<HTMLElement | null>(null)
const ring2 = ref<HTMLElement | null>(null)
const ring3 = ref<HTMLElement | null>(null)
const dots = ref<HTMLElement | null>(null)

onMounted(() => {
  if (logo.value) {
    animate(logo.value, {
      scale: [{ from: 0.6, to: 1 }],
      opacity: [{ from: 0, to: 1 }],
      duration: 700,
      ease: 'out(3)',
    })
    animate(logo.value, {
      translateY: [-3, 3],
      duration: 1800,
      delay: 700,
      loop: true,
      alternate: true,
      ease: 'inOut(2)',
    })
  }

  for (const [i, r] of [ring1.value, ring2.value, ring3.value].entries()) {
    if (!r) continue
    animate(r, {
      scale: [{ from: 0.8, to: 1.6 }],
      opacity: [
        { from: 0.5, to: 0 },
      ],
      duration: 1800,
      delay: i * 400,
      loop: true,
      ease: 'out(2)',
    })
  }

  if (dots.value) {
    animate(dots.value.children, {
      translateY: [-4, 4],
      opacity: [0.3, 1],
      duration: 700,
      delay: (_el: Element, i: number) => i * 120,
      loop: true,
      alternate: true,
      ease: 'inOut(2)',
    })
  }
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-bg)]"
  >
    <div class="relative flex items-center justify-center w-40 h-40">
      <span
        ref="ring1"
        class="absolute inset-0 rounded-full border border-[rgba(79,70,229,0.45)]"
      ></span>
      <span
        ref="ring2"
        class="absolute inset-0 rounded-full border border-[rgba(79,70,229,0.3)]"
      ></span>
      <span
        ref="ring3"
        class="absolute inset-0 rounded-full border border-[rgba(79,70,229,0.18)]"
      ></span>
      <div
        class="relative h-24 w-24 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center overflow-hidden"
      >
        <img
          ref="logo"
          src="/Logo.png"
          alt="Siri"
          class="h-16 w-16 object-contain"
        />
      </div>
    </div>

    <div class="mt-8 text-center">
      <p
        class="text-sm tracking-[0.25em] uppercase text-[var(--color-text-muted)]"
      >
        Siri Admin
      </p>
      <div ref="dots" class="mt-3 flex items-center justify-center gap-1.5">
        <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"></span>
        <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"></span>
        <span class="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"></span>
      </div>
    </div>
  </div>
</template>
