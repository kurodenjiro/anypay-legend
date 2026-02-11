<script>
  import "../app.css";
  import PrivyProvider from "$lib/components/PrivyProvider.svelte";
  import Navbar from "$lib/components/Navbar.svelte";
</script>

<PrivyProvider />

<div
  class="min-h-screen bg-black text-white pt-24 pb-12 selection:bg-gray-700 selection:text-white"
>
  <Navbar />
  <main
    class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center"
  >
    <slot />
  </main>
</div>
