import { Component, OnInit } from '@angular/core';
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
  shareOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  starOutline,
  timeOutline,
  trendingUpOutline,
  walletOutline,
  warningOutline
} from 'ionicons/icons';
import { AppIdentityService } from './services/app-identity.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(private identidad: AppIdentityService) {
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
      shareOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      starOutline,
      timeOutline,
      trendingUpOutline,
      walletOutline,
      warningOutline
    });
  }

  async ngOnInit(): Promise<void> {
    await this.identidad.inicializar();
  }
}
