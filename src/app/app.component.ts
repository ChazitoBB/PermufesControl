import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  arrowForwardOutline,
  bagHandleOutline,
  cartOutline,
  cashOutline,
  checkmarkCircleOutline,
  clipboardOutline,
  closeOutline,
  cloudUploadOutline,
  colorPaletteOutline,
  cubeOutline,
  discOutline,
  downloadOutline,
  giftOutline,
  homeOutline,
  layersOutline,
  logoWhatsapp,
  peopleOutline,
  pricetagsOutline,
  refreshOutline,
  ribbonOutline,
  searchOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  starOutline,
  timeOutline,
  trendingUpOutline,
  walletOutline,
  warningOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    addIcons({
      addOutline,
      alertCircleOutline,
      arrowForwardOutline,
      bagHandleOutline,
      cartOutline,
      cashOutline,
      checkmarkCircleOutline,
      clipboardOutline,
      closeOutline,
      cloudUploadOutline,
      colorPaletteOutline,
      cubeOutline,
      discOutline,
      downloadOutline,
      giftOutline,
      homeOutline,
      layersOutline,
      logoWhatsapp,
      peopleOutline,
      pricetagsOutline,
      refreshOutline,
      ribbonOutline,
      searchOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      starOutline,
      timeOutline,
      trendingUpOutline,
      walletOutline,
      warningOutline
    });
  }
}
