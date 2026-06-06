import { createApp } from "vue";
import App from "./App.vue";
import EncodingManager from "./EncodingManager.vue";

const RootComponent =
  window.location.hash === "#/encoding" ? EncodingManager : App;

createApp(RootComponent).mount("#app");
